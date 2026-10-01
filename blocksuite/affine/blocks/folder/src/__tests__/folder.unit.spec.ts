import { SurfaceBlockSchemaExtension } from '@blocksuite/affine-block-surface';
import {
  AttachmentBlockModel,
  AttachmentBlockSchemaExtension,
  FolderBlockModel,
  FolderBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { FileSizeLimitProvider } from '@blocksuite/affine-shared/services';
import type { BlockStdScope } from '@blocksuite/std';
import { TestWorkspace } from '@blocksuite/store/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  folderTitle,
  importSizeError,
  isFolderHtml,
  safeDownloadName,
} from '../file-helpers';
import { canWriteFolder, FolderPermissionsProvider } from '../permissions';
import {
  collectAttachments,
  extractAttachment,
  importFilesIntoFolder,
  removeFolderAttachment,
} from '../operations';

const workspaces: TestWorkspace[] = [];
afterEach(() => {
  workspaces.splice(0).forEach(workspace => workspace.dispose());
  vi.restoreAllMocks();
});
function fixture() {
  const workspace = new TestWorkspace();
  workspaces.push(workspace);
  workspace.meta.initialize();
  const doc = workspace.createDoc('folder-test');
  doc.load();
  const store = doc.getStore({
    extensions: [
      RootBlockSchemaExtension,
      SurfaceBlockSchemaExtension,
      AttachmentBlockSchemaExtension,
      FolderBlockSchemaExtension,
    ],
  });
  const root = store.addBlock('affine:page');
  const surfaceId = store.addBlock('affine:surface', {}, root);
  const surface = store.getBlock(surfaceId)!.model;
  const folderId = store.addBlock('affine:folder', {}, surface);
  const folder = store.getBlock(folderId)!.model as FolderBlockModel;
  const fileId = store.addBlock(
    'affine:attachment',
    {
      name: '原始.html',
      sourceId: 'original-blob',
      type: 'text/html',
      xywh: '[20,30,320,96]',
    },
    surface
  );
  const file = store.getBlock(fileId)!.model as AttachmentBlockModel;
  const flags = { allowed: true, active: true, max: 1000 };
  const gfx = {
    layer: { generateIndex: () => 'a9' },
    selection: { set: vi.fn() },
  };
  const std = {
    store,
    host: { isConnected: true },
    getOptional: (token: unknown) =>
      token === FolderPermissionsProvider
        ? { canWrite: () => flags.allowed, isCurrentDoc: () => flags.active }
        : undefined,
    get: (token: unknown) =>
      token === FileSizeLimitProvider ? { maxFileSize: flags.max } : gfx,
  } as unknown as BlockStdScope;
  store.resetHistory();
  return { workspace, store, surface, folder, file, flags, std };
}

describe('native file folder', () => {
  it('empty folder survives; title and flavour are native schema properties', () => {
    const { store, folder } = fixture();
    expect(folder.flavour).toBe('affine:folder');
    expect(folder.children).toHaveLength(0);
    expect(store.getBlock(folder.id)?.model).toBe(folder);
  });
  it('collect and extract preserve block/blob identity and undo parent changes', () => {
    const { store, folder, file, surface, std } = fixture();
    collectAttachments(std, folder, [file.id]);
    expect(file.parent?.id).toBe(folder.id);
    expect(file.props.sourceId).toBe('original-blob');
    extractAttachment(std, folder, file.id, true);
    expect(file.parent?.id).toBe(surface.id);
    expect(file.props.embed).toBe(true);
    expect(file.props.sourceId).toBe('original-blob');
    store.undo();
    expect(store.getBlock(file.id)?.model.parent?.id).toBe(folder.id);
    store.undo();
    expect(store.getBlock(file.id)?.model.parent?.id).toBe(surface.id);
  });
  it('collects non-contiguous picker selections without copying', () => {
    const { store, std, folder, file, surface } = fixture();
    store.addBlock('affine:attachment', { name: 'skip.txt' }, surface);
    const other = store.addBlock(
      'affine:attachment',
      { name: 'other.txt', sourceId: 'other-blob' },
      surface
    );
    collectAttachments(std, folder, [file.id, other]);
    expect(folder.children.map(model => model.id)).toEqual([file.id, other]);
  });
  it('plain store.deleteBlock evacuates files and one undo restores folder+children', () => {
    const { store, folder, file, surface } = fixture();
    store.moveBlocks([file], folder);
    store.resetHistory();
    const hook = vi.spyOn(folder, 'beforeDelete');
    store.deleteBlock(folder.id);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(store.getBlock(folder.id)).toBeUndefined();
    expect(store.getBlock(file.id)?.model.parent?.id).toBe(surface.id);
    expect(
      (store.getBlock(file.id)!.model as AttachmentBlockModel).props.sourceId
    ).toBe('original-blob');
    store.undo();
    expect(store.getBlock(folder.id)).toBeDefined();
    expect(store.getBlock(file.id)?.model.parent?.id).toBe(folder.id);
    store.redo();
    expect(store.getBlock(file.id)?.model.parent?.id).toBe(surface.id);
    expect(hook).toHaveBeenCalledTimes(1);
  });
  it('surface cascade does not evacuate into a parent being deleted', () => {
    const { store, folder, file, surface } = fixture();
    store.moveBlocks([file], folder);
    const hook = vi.spyOn(folder, 'beforeDelete');
    store.deleteBlock(surface);
    expect(store.getBlock(file.id)).toBeUndefined();
    expect(store.getBlock(folder.id)).toBeUndefined();
    expect(hook).not.toHaveBeenCalled();
  });
  it('generic delete refuses locked folders and app-denied deletion', () => {
    const { store, folder } = fixture();
    store.updateBlock(folder, { lockedBySelf: true });
    store.deleteBlock(folder);
    expect(store.getBlock(folder.id)).toBeDefined();
    store.updateBlock(folder, { lockedBySelf: false });
    folder.canDelete = () => false;
    store.deleteBlock(folder);
    expect(store.getBlock(folder.id)).toBeDefined();
  });
  it('remove is undoable and never changes the source id', () => {
    const { store, folder, file, std } = fixture();
    store.moveBlocks([file], folder);
    removeFolderAttachment(std, folder, file.id);
    expect(store.getBlock(file.id)).toBeUndefined();
    store.undo();
    expect(
      (store.getBlock(file.id)!.model as AttachmentBlockModel).props.sourceId
    ).toBe('original-blob');
  });
  it('fails closed for missing permissions, readonly and locked attachment collection', () => {
    const { std, folder, store, file, flags } = fixture();
    flags.allowed = false;
    expect(canWriteFolder(std, folder)).toBe(false);
    expect(() => collectAttachments(std, folder, [file.id])).toThrow();
    flags.allowed = true;
    store.readonly = true;
    expect(canWriteFolder(std, folder)).toBe(false);
    store.readonly = false;
    store.updateBlock(file, { lockedBySelf: true });
    expect(() => collectAttachments(std, folder, [file.id])).toThrow();
  });
  it('imports exact File with per-file successes/errors and never executes HTML', async () => {
    const { std, folder, store, flags } = fixture();
    flags.max = 20;
    const original = new File(['<p>ok</p>'], 'a.html', { type: 'text/html' });
    const oversized = new File(['x'.repeat(21)], 'big.bin');
    const upload = vi
      .spyOn(store.blobSync, 'set')
      .mockResolvedValue('same-bytes');
    const result = await importFilesIntoFolder(
      std,
      folder,
      [original, oversized],
      () => true
    );
    expect(upload).toHaveBeenCalledExactlyOnceWith(original);
    expect(result.map(file => file.status)).toEqual(['success', 'error']);
    const imported = folder.children[0] as AttachmentBlockModel;
    expect(imported.props.sourceId).toBe('same-bytes');
    expect(imported.props.embed).toBe(false);
  });
  it.each(['readonly', 'permission', 'navigation', 'deleted'] as const)(
    'rechecks %s after blob await',
    async reason => {
      const { std, store, folder, flags } = fixture();
      vi.spyOn(store.blobSync, 'set').mockImplementation(async () => {
        if (reason === 'readonly') store.readonly = true;
        if (reason === 'permission') flags.allowed = false;
        if (reason === 'navigation') flags.active = false;
        if (reason === 'deleted') store.deleteBlock(folder);
        return 'retained-for-undo';
      });
      const before = store.getBlocksByFlavour('affine:attachment').length;
      const results = await importFilesIntoFolder(
        std,
        folder,
        [new File(['abc'], 'a.txt')],
        () => true
      );
      expect(results[0].status).toBe('error');
      expect(store.getBlocksByFlavour('affine:attachment')).toHaveLength(
        before
      );
    }
  );
});

describe('folder pure helpers', () => {
  it('validates bounds and title without executing or parsing file HTML', () => {
    expect(folderTitle('  ')).toBe('文件夹');
    expect(folderTitle('x'.repeat(200))).toHaveLength(160);
    expect(importSizeError(1, 0)).toBeDefined();
    expect(importSizeError(0, 0)).toBeUndefined();
    expect(importSizeError(1, NaN)).toBeDefined();
    expect(isFolderHtml({ name: 'X.HTM', type: '' })).toBe(true);
    expect(
      isFolderHtml({ name: 'x.html', type: 'application/xhtml+xml' })
    ).toBe(false);
    expect(safeDownloadName('../x\\a.html')).toBe('.._x_a.html');
  });
});
