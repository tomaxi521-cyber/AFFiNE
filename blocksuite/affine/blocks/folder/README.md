# Native canvas folder

Flavour: affine:folder. A Gfx-compatible BlockModel with real affine:attachment children. No group/frame reuse; empty folders persist. External images are stored as attachments too.

## Host integration

- All schemas and internal store/view providers register this block once. Do not also register a second copy manually.
- Package API: @blocksuite/affine-block-folder (app facade may re-export as @blocksuite/affine/blocks/folder).
- Host must register FolderPermissionExtension({ canWrite(std), isCurrentDoc(std) }) in view extensions. These trusted synchronous callbacks must consult current native GuardService/active-document state; return false while permission is pending. Folder mutations fail closed without it.
- Bottom toolbar calls createFolder(std, title?) and receives the new block id.
- APIs: renameFolder, collectableAttachments, collectAttachments(std, folder, ids), extractAttachment(std, folder, id, open = false), removeFolderAttachment, deleteFolder, importFilesIntoFolder(std, folder, files, isActive?), downloadFolderAttachment.
- Import returns one success/error result per original File. Native FileSizeLimitProvider is checked before and after blob storage; identity, readonly, permissions and active doc are rechecked after await. Exact File goes to blobSync without text conversion.

## Deletion and identity

Native Store.deleteBlock calls the neutral synchronous BlockModel.beforeDelete(options) hook inside its existing transaction, before CRUD enumerates descendants. Only the explicitly requested block receives the hook. Folder moves original children to its surface before being removed; native keyboard Delete and multi-selection use this path. Locked/malformed content cancels deletion. The actual Y children array is checked after evacuation; a swallowed move error cannot cascade into leftover files.

Undo/redo and remote Y updates do not invoke this local API hook. Deleting the containing surface/root still cascades as before: descendants do not evacuate into a parent being removed. Folder-only delete is not permanent file deletion. Explicit file-row removal deletes the block with native undo; it retains the source blob. Multiple mounted editors share a set of live permission guards, not last-writer authorization.

Collection/extraction preserves block ids and sourceIds. Collection permits only same-surface ungrouped, unlocked, unconnected attachments. Non-contiguous selections use individual native moveBlocks calls within one transaction (the native batch API requires contiguous siblings).

## Content safety and limits

The folder renders text-only rows, never child attachment runtime views. HTML is not executed on import or collection. “取出并打开” moves the same attachment to the board, enabling the existing native safe HTML component only for supported HTML files. Downloads use application/octet-stream, sanitized filenames and download attribute; no window.open or navigable raw HTML blob.

No safe blob-deletion API exists. Retaining bytes is intentional for undo/shared references. An upload can finish after folder removal or permission revocation: its block is not created, but bytes may remain. This implementation does not claim orphan-free storage or remote-sync completion.

## Validation ownership

Focused Vitest source: src/__tests__/folder.unit.spec.ts (real in-memory TestWorkspace models plus fake host permissions/blob API). Parent integration owns execution, package resolution, app capability provider, toolbar, clipboard/board-copy allowlist, build/deploy and browser tests. Author has not run Git, builds, deployment or browser tools.

Browser acceptance still required: native drop imports once into folder (not canvas); title/input pointer and keyboard isolation; loading/lock/permission changes; generic Delete and multi-select deletion+undo; same-id collection/extraction; refresh and sync; HTML safety after extraction; cross-document interruption; native clipboard/copy/paste/clone.
