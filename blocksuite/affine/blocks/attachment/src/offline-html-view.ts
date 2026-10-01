import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import {
  buildOfflineHtmlSrcdoc,
  isOfflineHtmlExit,
  OFFLINE_HTML_MAX_BYTES,
  OFFLINE_HTML_PERMISSIONS,
} from './offline-html';

/** File-backed runtime. No privileged message bridge or implicit execution. */
export class OfflineHtmlView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      color: var(--affine-text-primary-color, #182139);
      font: 14px/1.5 var(--affine-font-family, sans-serif);
      background: var(--affine-background-primary-color, #fff);
    }
    * {
      box-sizing: border-box;
    }
    .shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      border: 0;
      border-radius: 8px;
    }
    .body {
      flex: 1;
      min-height: 0;
      position: relative;
      overflow: auto;
    }
    .frame {
      position: absolute;
      inset: 0;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: white;
    }
    .mask {
      position: absolute;
      inset: 0;
    }
    .intro {
      padding: 24px;
      max-width: 680px;
      margin: auto;
    }
    h3 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .error {
      color: #b42318;
    }
  `;
  @property({ attribute: false }) accessor sourceId = '';
  @property({ attribute: false }) accessor name = '';
  @property({ type: Number }) accessor size = 0;
  @property({ type: Boolean }) accessor canRun = false;
  @property({ type: Boolean }) accessor readOnly = false;
  @property({ attribute: false }) accessor loadBlob:
    | (() => Promise<Blob | null>)
    | undefined;
  @property({ attribute: false }) accessor onState:
    | ((state: { active: boolean; running: boolean; loading: boolean }) => void)
    | undefined;
  @state() private accessor srcdoc = '';
  @state() private accessor active = false;
  @state() private accessor loading = false;
  @state() private accessor error = '';
  @state() private accessor generation = 0;
  private ticket = 0;
  private readonly onExitMessage = (event: MessageEvent) => {
    const frame = this.shadowRoot?.querySelector('iframe');
    if (
      this.active &&
      this.canRun &&
      !this.readOnly &&
      frame &&
      event.source === frame.contentWindow &&
      isOfflineHtmlExit(event.data)
    )
      this.exit();
  };
  private readonly onEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.exit();
    }
  };
  private readonly outside = (event: Event) => {
    const path = event.composedPath();
    // The host toolbar is outside the block, not inside untrusted content.
    if (
      path.some(
        node => node instanceof HTMLElement && node.tagName === 'EDITOR-TOOLBAR'
      )
    )
      return;
    if (!path.includes(this)) this.active = false;
  };
  override connectedCallback() {
    super.connectedCallback();
    this.ownerDocument.addEventListener('pointerdown', this.outside, true);
    this.ownerDocument.addEventListener('keydown', this.onEscape, true);
    this.ownerDocument.defaultView?.addEventListener(
      'message',
      this.onExitMessage
    );
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.ticket++;
    this.loading = false;
    this.active = false;
    this.srcdoc = '';
    this.onState?.({ active: false, running: false, loading: false });
    this.ownerDocument.removeEventListener('pointerdown', this.outside, true);
    this.ownerDocument.removeEventListener('keydown', this.onEscape, true);
    this.ownerDocument.defaultView?.removeEventListener(
      'message',
      this.onExitMessage
    );
  }
  protected override willUpdate(changes: PropertyValues) {
    if (changes.has('sourceId')) {
      this.ticket++;
      this.srcdoc = '';
      this.loading = false;
      this.active = false;
      this.error = '';
    }
    if (!this.canRun) {
      this.active = false;
      if (this.loading) {
        this.ticket++;
        this.loading = false;
      }
    }
    if (this.readOnly) {
      this.active = false;
      this.srcdoc = '';
      if (this.loading) {
        this.ticket++;
        this.loading = false;
      }
    }
  }
  protected override updated() {
    this.onState?.({
      active: this.active && this.canRun && !this.readOnly,
      running: !!this.srcdoc,
      loading: this.loading,
    });
  }
  exit = () => {
    this.active = false;
    this.shadowRoot?.querySelector('iframe')?.blur();
    // Return focus to an owned element under the editor, without changing selection.
    this.tabIndex = -1;
    this.focus({ preventScroll: true });
  };
  run = async () => {
    if (!this.canRun || this.readOnly || this.loading) return;
    if (this.srcdoc) {
      this.active = true;
      return;
    }
    if (this.size > OFFLINE_HTML_MAX_BYTES) {
      this.error = '文件超过 5 MiB，保留原件供下载；请改用较小的自包含 HTML。';
      return;
    }
    const ticket = ++this.ticket;
    const source = this.sourceId;
    this.loading = true;
    this.error = '';
    try {
      const blob = await this.loadBlob?.();
      if (!blob) throw new Error('原文件暂不可用，请等待同步完成后重试。');
      if (blob.size > OFFLINE_HTML_MAX_BYTES)
        throw new Error('文件超过 5 MiB，无法运行；原件仍可下载。');
      const text = await blob.text();
      if (
        !this.isConnected ||
        ticket !== this.ticket ||
        source !== this.sourceId ||
        !this.canRun ||
        this.readOnly
      )
        return;
      this.srcdoc = buildOfflineHtmlSrcdoc(text);
      this.active = true;
    } catch (error) {
      if (ticket === this.ticket)
        this.error =
          error instanceof Error ? error.message : '无法读取 HTML 原文件。';
    } finally {
      if (ticket === this.ticket) this.loading = false;
    }
  };
  reset = () => {
    this.ticket++;
    this.generation++;
    this.srcdoc = '';
    this.active = false;
    this.loading = false;
    this.error = '';
  };
  protected override render() {
    const active = this.active && this.canRun;
    return html`<section class="shell">
      <div class="body">
        ${this.srcdoc
          ? html`<div
                class="frame"
                ?inert=${!active}
                style=${active ? '' : 'pointer-events:none'}
              >
                ${keyed(
                  this.generation,
                  html`<iframe
                    title="离线 HTML 隔离容器"
                    sandbox="allow-scripts"
                    allow=${OFFLINE_HTML_PERMISSIONS}
                    referrerpolicy="no-referrer"
                    tabindex=${active ? '0' : '-1'}
                    .srcdoc=${this.srcdoc}
                  ></iframe>`
                )}
              </div>
              ${!active ? html`<div class="mask"></div>` : nothing}`
          : html`<div class="intro">
              <h3>可交互的离线 HTML</h3>
              <p>
                选中组件，在上方浮动工具栏点击「运行
                HTML」。运行后可在内部点击、输入和滚动；按 Esc
                或从同一工具栏退出操作。
              </p>
              <p>
                仅支持 5 MiB
                以内、内联脚本/样式/资源的自包含文件；外部网址、CDN、相邻资源目录及服务端功能不可用。
              </p>
              <p>
                文件会执行
                JavaScript，请只运行信任的文件。隔离不保证资源限额或完全断网。
              </p>
              <p>
                原文件已保存；退出只交还焦点，脚本继续运行。刷新、关闭文档或重置会清空临时状态。受阻跳转可通过工具栏更多菜单的
                Reload 恢复。
              </p>
              ${this.error
                ? html`<p role="alert" class="error">${this.error}</p>`
                : nothing}
            </div>`}
      </div>
    </section>`;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'dikw-offline-html': OfflineHtmlView;
  }
}
