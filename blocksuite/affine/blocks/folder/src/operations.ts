import type { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import {
  AttachmentBlockModel,
  FolderBlockModel,
} from '@blocksuite/affine-model';
import { FileSizeLimitProvider } from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import {
  folderTitle,
  importSizeError,
  isFolderHtml,
  safeDownloadName,
} from './file-helpers';
import { canWriteFolder, FolderPermissionsProvider } from './permissions';

function assertWritable(std: BlockStdScope, folder?: FolderBlockModel) {
  if (!canWriteFolder(std, folder))
    throw new Error('当前文件夹不可写：请检查权限、锁定状态和当前白板');
}
function surfaceOf(
  std: BlockStdScope,
  folder: FolderBlockModel
): SurfaceBlockModel {
  assertWritable(std, folder);
  return folder.parent as SurfaceBlockModel;
}
function attachmentOf(
  std: BlockStdScope,
  folder: FolderBlockModel,
  id: string
) {
  assertWritable(std, folder);
  const model = std.store.getBlock(id)?.model;
  if (
    !(model instanceof AttachmentBlockModel) ||
    model.parent?.id !== folder.id ||
    model.isLocked()
  ) {
    throw new Error('文件已移走、被锁定或不存在');
  }
  return model;
}
function undoable(std: BlockStdScope, action: () => void) {
  std.store.captureSync();
  try {
    std.store.transact(action);
  } finally {
    std.store.captureSync();
  }
}

/** Creates an empty persistent native folder at the current viewport center. */
export function createFolder(std: BlockStdScope, title = '文件夹'): string {
  assertWritable(std);
  const gfx = std.get(GfxControllerIdentifier);
  if (!gfx.surface) throw new Error('当前文档没有白板');
  const { x, y } = gfx.viewport.center;
  std.store.captureSync();
  const id = std.store.addBlock(
    'affine:folder',
    {
      title: folderTitle(title),
      xywh: new Bound(x - 210, y - 160, 420, 320).serialize(),
      index: gfx.layer.generateIndex(),
    },
    gfx.surface
  );
  std.store.captureSync();
  const folder = std.store.getBlock(id)?.model as FolderBlockModel | undefined;
  if (!folder) throw new Error('创建文件夹失败');
  gfx.selection.set({ elements: [id], editing: false });
  return id;
}

export function renameFolder(
  std: BlockStdScope,
  folder: FolderBlockModel,
  title: string
) {
  assertWritable(std, folder);
  undoable(std, () =>
    std.store.updateBlock(folder, { title: folderTitle(title) })
  );
}

/** Only ungrouped, unlocked, unconnected attachments already on this board. */
export function collectableAttachments(
  std: BlockStdScope,
  folder: FolderBlockModel
): AttachmentBlockModel[] {
  if (!canWriteFolder(std, folder)) return [];
  const surface = folder.parent as SurfaceBlockModel;
  return surface.children.filter(
    (model): model is AttachmentBlockModel =>
      model instanceof AttachmentBlockModel &&
      !model.isLocked() &&
      !model.group &&
      surface.getConnectors(model.id).length === 0
  );
}
export function collectAttachments(
  std: BlockStdScope,
  folder: FolderBlockModel,
  ids: string[]
): void {
  assertWritable(std, folder);
  const eligible = new Map(
    collectableAttachments(std, folder).map(model => [model.id, model])
  );
  const models = [...new Set(ids)].map(id => {
    const model = eligible.get(id);
    if (!model)
      throw new Error('仅可收纳当前白板上未锁定、未编组且没有连线的附件');
    return model;
  });
  if (!models.length) return;
  // Native moveBlocks requires contiguous siblings. Picker selections need not
  // be contiguous, so move each original in one shared undo transaction.
  undoable(std, () =>
    models.forEach(model => std.store.moveBlocks([model], folder))
  );
  if (models.some(model => model.parent?.id !== folder.id))
    throw new Error('收纳未完成，请检查白板状态');
  std
    .get(GfxControllerIdentifier)
    .selection.set({ elements: [folder.id], editing: false });
}

/** Moves the original attachment (never clones its id or blob) beside the folder. */
export function extractAttachment(
  std: BlockStdScope,
  folder: FolderBlockModel,
  id: string,
  open = false
): string {
  const surface = surfaceOf(std, folder);
  const attachment = attachmentOf(std, folder, id);
  const folderBound = folder.elementBound;
  const old = attachment.elementBound;
  const html = open && isFolderHtml(attachment.props);
  const width = html ? 800 : old.w > 0 ? old.w : 320;
  const height = html ? 560 : old.h > 0 ? old.h : 96;
  undoable(std, () => {
    std.store.updateBlock(attachment, {
      xywh: new Bound(
        folderBound.x + folderBound.w + 32,
        folderBound.y,
        width,
        height
      ).serialize(),
      index: std.get(GfxControllerIdentifier).layer.generateIndex(),
      ...(html ? { embed: true } : {}),
    });
    std.store.moveBlocks([attachment], surface);
  });
  if (attachment.parent?.id !== surface.id)
    throw new Error('取出未完成，请检查白板状态');
  std
    .get(GfxControllerIdentifier)
    .selection.set({ elements: [id], editing: false });
  return id;
}

/** Removes the block from this board only. Bytes remain for native undo/sync. */
export function removeFolderAttachment(
  std: BlockStdScope,
  folder: FolderBlockModel,
  id: string
): void {
  const attachment = attachmentOf(std, folder, id);
  undoable(std, () => std.store.deleteBlock(attachment));
}
export function deleteFolder(
  std: BlockStdScope,
  folder: FolderBlockModel
): void {
  assertWritable(std, folder);
  undoable(std, () => std.store.deleteBlock(folder));
  if (std.store.getBlock(folder.id))
    throw new Error('文件夹未删除，请检查文件锁定状态');
}

export type FolderImportResult =
  | { name: string; status: 'success'; blockId: string }
  | { name: string; status: 'error'; error: string };

/** Exact original File goes to native blobSync. A failure never deletes blobs:
 * no safe delete API exists, and undo or another block may still reference it.
 */
export async function importFilesIntoFolder(
  std: BlockStdScope,
  folder: FolderBlockModel,
  files: readonly File[],
  isActive: () => boolean = () => std.host.isConnected
): Promise<FolderImportResult[]> {
  const store = std.store;
  const doc = store.doc;
  const results: FolderImportResult[] = [];
  const recheck = () => {
    if (std.store !== store || std.store.doc !== doc || !isActive())
      throw new Error('白板已切换或文件夹已关闭');
    assertWritable(std, folder);
  };
  for (const file of files) {
    try {
      recheck();
      const sizeError = importSizeError(
        file.size,
        std.get(FileSizeLimitProvider).maxFileSize
      );
      if (sizeError) throw new Error(sizeError);
      const sourceId = await store.blobSync.set(file);
      recheck();
      // Permissions, native limits and folder identity may change while uploading.
      const changedLimit = importSizeError(
        file.size,
        std.get(FileSizeLimitProvider).maxFileSize
      );
      if (changedLimit) throw new Error(changedLimit);
      store.captureSync();
      const id = store.addBlock(
        'affine:attachment',
        {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          sourceId,
          embed: false,
          style: 'horizontalThin',
          xywh: '[0,0,320,96]',
        },
        folder
      );
      store.captureSync();
      if (store.getBlock(id)?.model.parent?.id !== folder.id)
        throw new Error('文件记录未保存');
      results.push({ name: file.name, status: 'success', blockId: id });
    } catch (error) {
      results.push({
        name: file.name,
        status: 'error',
        error: error instanceof Error ? error.message : '导入失败',
      });
    }
  }
  return results;
}

/** Download-only: octet-stream blob + download attribute, never window.open. */
export async function downloadFolderAttachment(
  std: BlockStdScope,
  folder: FolderBlockModel,
  id: string
): Promise<void> {
  const store = std.store;
  const attachment = store.getBlock(id)?.model;
  if (
    !(attachment instanceof AttachmentBlockModel) ||
    attachment.parent?.id !== folder.id ||
    !attachment.props.sourceId
  ) {
    throw new Error('文件内容尚未同步或不存在');
  }
  const sourceId = attachment.props.sourceId;
  const blob = await store.blobSync.get(sourceId);
  if (!blob) throw new Error('文件内容尚未同步，请稍后重试');
  if (
    std.store !== store ||
    !std.host.isConnected ||
    std.getOptional(FolderPermissionsProvider)?.isCurrentDoc(std) === false ||
    store.getBlock(folder.id)?.model !== folder ||
    store.getBlock(id)?.model !== attachment ||
    attachment.parent?.id !== folder.id ||
    attachment.props.sourceId !== sourceId
  ) {
    throw new Error('白板或文件已变化，请重新下载');
  }
  const url = URL.createObjectURL(
    new Blob([blob], { type: 'application/octet-stream' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeDownloadName(attachment.props.name);
  anchor.rel = 'noopener noreferrer';
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
