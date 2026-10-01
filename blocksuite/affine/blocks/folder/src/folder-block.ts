import {
  AttachmentBlockModel,
  type FolderBlockModel,
} from '@blocksuite/affine-model';
import { BlockComponent, toGfxBlockComponent } from '@blocksuite/std';
import { css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { live } from 'lit/directives/live.js';
import { canWriteFolder } from './permissions';
import {
  collectableAttachments,
  collectAttachments,
  deleteFolder,
  downloadFolderAttachment,
  extractAttachment,
  importFilesIntoFolder,
  removeFolderAttachment,
  renameFolder,
  type FolderImportResult,
} from './operations';

class FolderBaseComponent extends BlockComponent<FolderBlockModel> {}

/** Inert rows only: never render child attachment/HTML execution views here. */
export class FolderBlockComponent extends toGfxBlockComponent(
  FolderBaseComponent
) {
  static override styles = css`
    affine-folder {
      display: block;
      box-sizing: border-box;
      color: var(--affine-text-primary-color, #222);
      font: 14px var(--affine-font-family, sans-serif);
    }
    affine-folder .folder-card {
      height: 100%;
      width: 100%;
      min-width: 280px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--affine-border-color, #ddd);
      border-radius: 12px;
      background: var(--affine-background-primary-color, #fff);
      box-shadow: 0 3px 12px #0000000d;
      overflow: hidden;
    }
    affine-folder header {
      padding: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      border-bottom: 1px solid var(--affine-border-color, #eee);
    }
    affine-folder input[type='text'] {
      flex: 1;
      width: 80px;
      font: inherit;
      font-weight: 600;
      color: inherit;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 4px;
    }
    affine-folder input[type='text']:focus {
      border-color: var(--affine-primary-color, #777);
      outline: none;
    }
    affine-folder button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid var(--affine-border-color, #ddd);
      border-radius: 5px;
      padding: 4px 7px;
      cursor: pointer;
      white-space: nowrap;
    }
    affine-folder button:hover:not(:disabled) {
      background: var(--affine-hover-color, #f4f4f4);
    }
    affine-folder button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    affine-folder .folder-controls {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      flex-wrap: wrap;
    }
    affine-folder .folder-files {
      overflow: auto;
      flex: 1;
      min-height: 40px;
      padding: 0 12px;
    }
    affine-folder .folder-row {
      padding: 8px 0;
      border-bottom: 1px solid var(--affine-border-color, #eee);
    }
    affine-folder .file-name {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    affine-folder .file-actions {
      display: flex;
      gap: 5px;
      margin-top: 5px;
    }
    affine-folder small,
    affine-folder .folder-hint {
      color: var(--affine-text-secondary-color, #777);
      font-size: 12px;
    }
    affine-folder .folder-hint {
      padding: 8px 12px;
      margin: 0;
    }
    affine-folder .folder-results {
      max-height: 90px;
      overflow: auto;
      padding: 6px 12px;
      font-size: 12px;
    }
    affine-folder .folder-error {
      color: var(--affine-error-color, #bc3030);
    }
    affine-folder .folder-picker {
      border: 1px solid var(--affine-border-color, #ddd);
      margin: 0 12px 8px;
      padding: 8px;
      overflow: auto;
      max-height: 150px;
    }
    affine-folder .folder-picker label {
      display: block;
      margin-bottom: 6px;
    }
  `;
  private busy = false;
  private message = '';
  private results: FolderImportResult[] = [];
  private picker = false;
  private selected = new Set<string>();

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.store.slots.blockUpdated.subscribe(() => this.requestUpdate())
    );
    this.addEventListener('dragover', this.onDragOver);
    this.addEventListener('drop', this.onDrop);
  }
  override disconnectedCallback() {
    this.removeEventListener('dragover', this.onDragOver);
    this.removeEventListener('drop', this.onDrop);
    super.disconnectedCallback();
  }
  private stop(event: Event) {
    event.stopPropagation();
  }
  private onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect =
      canWriteFolder(this.std, this.model) && !this.busy ? 'copy' : 'none';
  };
  private onDrop = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.importFiles(Array.from(event.dataTransfer.files));
  };
  private async run(action: () => unknown | Promise<unknown>) {
    this.message = '';
    try {
      await action();
    } catch (error) {
      this.message = error instanceof Error ? error.message : '操作失败';
    }
    this.requestUpdate();
  }
  private async importFiles(files: File[]) {
    if (this.busy || !files.length) return;
    if (!canWriteFolder(this.std, this.model)) {
      this.message = '文件夹不可写，文件未导入';
      this.requestUpdate();
      return;
    }
    this.busy = true;
    this.results = [];
    this.requestUpdate();
    try {
      this.results = await importFilesIntoFolder(
        this.std,
        this.model,
        files,
        () => this.isConnected
      );
    } finally {
      this.busy = false;
      this.requestUpdate();
    }
  }
  private renderFile(file: AttachmentBlockModel, writable: boolean) {
    return html`<div class="folder-row">
      <span class="file-name" title=${file.props.name}
        >📄 ${file.props.name || '未命名文件'}</span
      >
      <small>${file.props.size.toLocaleString()} 字节</small>
      <div class="file-actions">
        <button
          @click=${() =>
            this.run(() =>
              downloadFolderAttachment(this.std, this.model, file.id)
            )}
        >
          下载
        </button>
        <button
          ?disabled=${!writable || file.isLocked()}
          title="取出原文件到白板；HTML 使用原生安全组件"
          @click=${() =>
            this.run(() =>
              extractAttachment(this.std, this.model, file.id, true)
            )}
        >
          取出并打开
        </button>
        <button
          ?disabled=${!writable || file.isLocked()}
          title="仅从白板移除，可撤销；不永久删除文件字节"
          @click=${() =>
            this.run(() => {
              if (
                window.confirm(
                  '从白板移除此文件？可撤销，原始字节不会被永久删除。'
                )
              )
                removeFolderAttachment(this.std, this.model, file.id);
            })}
        >
          移除
        </button>
      </div>
    </div>`;
  }
  override renderGfxBlock() {
    const writable = canWriteFolder(this.std, this.model) && !this.busy;
    const files = this.model.children.filter(
      (model): model is AttachmentBlockModel =>
        model instanceof AttachmentBlockModel
    );
    const candidates = this.picker
      ? collectableAttachments(this.std, this.model)
      : [];
    return html`<section class="folder-card" aria-label="文件夹">
      <header>
        <span aria-hidden="true">📁</span>
        <input
          type="text"
          aria-label="文件夹名称"
          maxlength="160"
          .value=${live(this.model.props.title)}
          ?disabled=${!writable}
          @pointerdown=${this.stop}
          @click=${this.stop}
          @keydown=${this.stop}
          @change=${(event: Event) =>
            this.run(() =>
              renameFolder(
                this.std,
                this.model,
                (event.target as HTMLInputElement).value
              )
            )}
        />
        <small>${files.length} 个文件</small>
      </header>
      <div
        class="folder-controls"
        @pointerdown=${this.stop}
        @click=${this.stop}
        @keydown=${this.stop}
      >
        <input
          type="file"
          multiple
          hidden
          @change=${(event: Event) => {
            const input = event.target as HTMLInputElement;
            const files = Array.from(input.files ?? []);
            input.value = '';
            void this.importFiles(files);
          }}
        />
        <button
          ?disabled=${!writable}
          @click=${() =>
            this.querySelector<HTMLInputElement>('input[type=file]')?.click()}
        >
          ${this.busy ? '导入中…' : '导入文件'}
        </button>
        <button
          ?disabled=${!writable}
          @click=${() => {
            this.picker = !this.picker;
            this.selected.clear();
            this.requestUpdate();
          }}
        >
          收纳白板文件
        </button>
        <button
          ?disabled=${!writable}
          title="文件将取出到白板，文件夹可撤销恢复"
          @click=${() => this.run(() => deleteFolder(this.std, this.model))}
        >
          删除文件夹
        </button>
      </div>
      ${this.picker
        ? html`<div
            class="folder-picker"
            @pointerdown=${this.stop}
            @click=${this.stop}
            @keydown=${this.stop}
          >
            <small>仅列出本白板未锁定、未编组、无连线的附件。</small>
            ${candidates.length
              ? candidates.map(
                  file =>
                    html`<label
                      ><input
                        type="checkbox"
                        .checked=${this.selected.has(file.id)}
                        @change=${(event: Event) => {
                          (event.target as HTMLInputElement).checked
                            ? this.selected.add(file.id)
                            : this.selected.delete(file.id);
                          this.requestUpdate();
                        }}
                      />
                      ${file.props.name || '未命名文件'}</label
                    >`
                )
              : html`<p>没有可收纳的文件</p>`}
            <button
              ?disabled=${!writable || !this.selected.size}
              @click=${() =>
                this.run(() => {
                  collectAttachments(this.std, this.model, [...this.selected]);
                  this.selected.clear();
                  this.picker = false;
                })}
            >
              收纳所选
            </button>
          </div>`
        : nothing}
      <div
        class="folder-files"
        @pointerdown=${this.stop}
        @click=${this.stop}
        @dblclick=${this.stop}
        @keydown=${this.stop}
        @wheel=${this.stop}
      >
        ${files.length
          ? repeat(
              files,
              file => file.id,
              file => this.renderFile(file, writable)
            )
          : html`<p>空文件夹 · 拖入文件或收纳已有附件</p>`}
      </div>
      <p class="folder-hint">
        删除文件夹会把文件取出到白板；HTML 不会在此自动运行。
      </p>
      <div class="folder-results" role="status" aria-live="polite">
        ${this.results.map(
          result =>
            html`<div class=${result.status === 'error' ? 'folder-error' : ''}>
              ${result.name}：${result.status === 'success'
                ? '已导入'
                : result.error}
            </div>`
        )}
        ${this.message
          ? html`<div class="folder-error">${this.message}</div>`
          : nothing}
      </div>
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-folder': FolderBlockComponent;
  }
}
