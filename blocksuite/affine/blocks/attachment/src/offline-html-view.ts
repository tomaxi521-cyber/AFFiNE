import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import {
  buildOfflineHtmlSrcdoc,
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
      min-height: 300px;
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
      border: 1px solid var(--affine-border-color, #ddd);
      border-radius: 8px;
    }
    header {
      flex: none;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      background: var(--affine-background-secondary-color, #f6f7f8);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      flex: none;
      font: inherit;
      border: 1px solid var(--affine-border-color, #ddd);
      border-radius: 6px;
      padding: 4px 10px;
      color: inherit;
      background: var(--affine-background-primary-color, #fff);
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    button:focus-visible {
      outline: 2px solid #315bdc;
      outline-offset: 2px;
    }
    .body {
      flex: 1;
      min-height: 0;
      position: relative;
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
    .hint {
      flex: none;
      font-size: 11px;
      padding: 4px 10px;
      background: var(--affine-background-secondary-color, #f6f7f8);
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
  @property({ attribute: false }) accessor download: (() => void) | undefined;
  @state() private accessor srcdoc = '';
  @state() private accessor active = false;
  @state() private accessor loading = false;
  @state() private accessor error = '';
  @state() private accessor generation = 0;
  private ticket = 0;
  private readonly outside = (event: Event) => {
    if (!event.composedPath().includes(this)) this.active = false;
  };
  override connectedCallback() {
    super.connectedCallback();
    this.ownerDocument.addEventListener('pointerdown', this.outside, true);
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.ticket++;
    this.loading = false;
    this.active = false;
    this.srcdoc = '';
    this.ownerDocument.removeEventListener('pointerdown', this.outside, true);
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
    if (this.readOnly) this.srcdoc = '';
  }
  private stop(event: Event) {
    event.stopPropagation();
  }
  private exit = (event: Event) => {
    this.stop(event);
    this.active = false;
    this.updateComplete
      .then(() =>
        this.renderRoot
          .querySelector<HTMLButtonElement>('[data-action=run]')
          ?.focus()
      )
      .catch(console.error);
  };
  private run = async (event: Event) => {
    this.stop(event);
    if (!this.canRun || this.loading) return;
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
        !this.canRun
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
  private reset = (event: Event) => {
    this.stop(event);
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
      <header>
        <span class="name" title=${this.name}>HTML · ${this.name}</span>
        <button
          @pointerdown=${this.stop}
          @click=${() => this.download?.()}
          title="下载未修改的 HTML 原文件"
        >
          下载
        </button>
        ${this.srcdoc
          ? html`<button
              data-action="reset"
              @pointerdown=${this.stop}
              @click=${this.reset}
              title="清空临时状态，重新回到运行确认"
            >
              重置
            </button>`
          : nothing}
        ${active
          ? html`<button
              data-action="exit"
              @pointerdown=${this.stop}
              @click=${this.exit}
            >
              退出操作
            </button>`
          : html`<button
              data-action="run"
              ?disabled=${!this.canRun || this.loading}
              @pointerdown=${this.stop}
              @click=${this.run}
            >
              ${this.loading
                ? '读取中…'
                : this.srcdoc
                  ? '进入操作'
                  : '运行 HTML'}
            </button>`}
      </header>
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
              <p>选中组件后点击「运行 HTML」，在白板内使用按钮、表单和图表。</p>
              <p>
                仅支持 5 MiB
                以内、内联脚本/样式/资源的自包含文件；外部网址、CDN、相邻资源目录及服务端功能不可用。
              </p>
              <p>
                文件会执行
                JavaScript，请只运行信任的文件。隔离不保证资源限额或完全断网。
              </p>
              ${this.error
                ? html`<p role="alert" class="error">${this.error}</p>`
                : nothing}
            </div>`}
      </div>
      <div class="hint">
        ${!this.canRun
          ? '请先选中可编辑的组件。'
          : active
            ? '正在操作内容 · 点击外部或「退出操作」返回白板。'
            : '白板操作模式。'}
        原文件已保留；退出仅交还焦点，脚本仍运行；刷新/关闭文档/切为卡片视图/重置会清空临时状态。跳转被阻止时可点「重置」。
      </div>
    </section>`;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'dikw-offline-html': OfflineHtmlView;
  }
}
