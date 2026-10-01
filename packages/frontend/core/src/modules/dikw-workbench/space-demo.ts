import { NoteDisplayMode } from '@blocksuite/affine/model';
import { type Store, Text } from '@blocksuite/affine/store';
import { nanoid } from 'nanoid';

import type { DocsService } from '../doc';
import type { GuardService } from '../permissions';
import type { WorkspaceService } from '../workspace';
import type { DikwWorkbenchService } from './service';

const LAYERS = [
  {
    title: '空间体验样板',
    lines: [
      '空间体验样板 · 合成示例',
      '这是新建的独立样板，不包含你的已有资料。',
      '从「产品研究」子白板入口进入下一层，再用路径导航返回。',
    ],
  },
  {
    title: '产品研究',
    lines: [
      '产品研究 · 合成示例',
      '研究问题：怎样更快找回资料，并保留它们的上下文？',
      '进入「访谈分析」查看示例观察；此处不代表真实研究结论。',
    ],
  },
  {
    title: '访谈分析',
    lines: [
      '访谈分析 · 合成示例',
      '示例观察：使用者希望在同一空间中整理材料与想法。',
      '待验证想法：按主题组织资料，再用子白板展开细节。',
    ],
  },
] as const;

type LayerJournal = {
  operationId: string;
  docId?: string;
  notesSaved: boolean;
};
type DemoJournal = {
  version: 1;
  mainId?: string;
  layers: LayerJournal[];
  complete: boolean;
};

export interface SpaceDemoDependencies {
  service: DikwWorkbenchService;
  docs: DocsService;
  guard: GuardService;
  workspace: WorkspaceService['workspace'];
  serverId: string;
}

function readJournal(raw: string | null): DemoJournal {
  if (raw === null) {
    return {
      version: 1,
      layers: LAYERS.map(() => ({ operationId: nanoid(), notesSaved: false })),
      complete: false,
    };
  }
  // Invalid/partial journals are never replaced with a new operation.
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('样板操作记录损坏，请保留记录并联系维护者。');
  const journal = value as Partial<DemoJournal>;
  const validId = (id: unknown) => typeof id === 'string' && id.length > 0;
  if (
    journal.version !== 1 || typeof journal.complete !== 'boolean' ||
    (journal.mainId !== undefined && !validId(journal.mainId)) ||
    !Array.isArray(journal.layers) || journal.layers.length !== LAYERS.length ||
    journal.layers.some(layer => !layer || !validId(layer.operationId) ||
      typeof layer.notesSaved !== 'boolean' ||
      (layer.docId !== undefined && !validId(layer.docId)) ||
      (layer.notesSaved && !layer.docId)) ||
    new Set(journal.layers.map(layer => layer.operationId)).size !== LAYERS.length ||
    new Set(journal.layers.flatMap(layer => layer.docId ? [layer.docId] : [])).size !==
      journal.layers.filter(layer => layer.docId).length ||
    journal.layers.some(layer => layer.docId !== undefined && layer.docId === journal.mainId) ||
    (journal.layers.some(layer => layer.docId) && !journal.mainId) ||
    journal.layers.some((layer, index) => layer.docId && index > 0 && !journal.layers?.[index - 1].docId) ||
    (journal.complete && journal.layers.some(layer => !layer.docId || !layer.notesSaved))
  ) {
    throw new Error('样板操作记录不完整，请保留记录并联系维护者；不会创建替代样板。');
  }
  return journal as DemoJournal;
}

/** Native blocks only. Existing blocks (including edited text) are never reset. */
function insertNotes(store: Store, operationId: string, lines: readonly string[]) {
  if (store.readonly) throw new Error('样板白板为只读。');
  const root = store.root;
  if (!root || !store.getBlocksByFlavour('affine:surface').length) {
    throw new Error('样板白板内容尚未就绪。');
  }
  const noteId = 'dikw-space-demo-v1-' + operationId + '-note';
  const note = store.getBlock(noteId)?.model;
  if (note && (note.flavour !== 'affine:note' || store.getParent(note)?.id !== root.id)) {
    throw new Error('样板便签结构已改变，请检查已有内容。');
  }
  if (!note) {
    store.addBlock('affine:note', {
      id: noteId,
      xywh: '[0,0,460,220]',
      displayMode: NoteDisplayMode.EdgelessOnly,
    }, root.id);
  }
  lines.forEach((line, index) => {
    const id = noteId + '-paragraph-' + index;
    const existing = store.getBlock(id)?.model;
    if (existing) {
      if (existing.flavour !== 'affine:paragraph' || store.getParent(existing)?.id !== noteId) {
        throw new Error('样板文字结构已改变，请检查已有内容。');
      }
      return;
    }
    store.addBlock('affine:paragraph', {
      id,
      type: index === 0 ? 'h2' : 'text',
      text: new Text(line),
    }, noteId);
  });
}

/** Call ONLY from an explicit user action. No startup, route or effect seeding. */
export async function createSpaceDemo({
  service, docs, guard, workspace, serverId,
}: SpaceDemoDependencies): Promise<string> {
  if (workspace.flavour !== 'local' && !serverId) {
    throw new Error('工作区服务器尚未就绪，请稍后重试。');
  }
  const key = 'dikw:space-demo:v1:' + JSON.stringify([
    workspace.flavour, serverId, workspace.id,
  ]);
  const assertWritable = () => {
    if (workspace.openOptions.isSharedMode) throw new Error('分享模式不能创建空间样板。');
  };
  const assertDoc = async (id: string, edit: boolean) => {
    assertWritable();
    if (await guard.can('Doc_Read', id) !== true ||
      (edit && await guard.can('Doc_Update', id) !== true)) {
      throw new Error('没有读取或编辑样板白板的权限。');
    }
    assertWritable();
    if (docs.list.doc$(id).value?.trash$.value !== false) {
      throw new Error('白板已删除或尚未同步；不会创建替代白板。');
    }
  };
  assertWritable();
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('当前环境不支持安全创建样板。');
  }
  // Covers both the journal and native fixture insertion across browser tabs.
  return navigator.locks.request(key, async () => {
    assertWritable();
    await workspace.engine.doc.waitForDocReady(workspace.id);
    const journal = readJournal(localStorage.getItem(key));
    const save = () => localStorage.setItem(key, JSON.stringify(journal));
    // All child operation IDs must be durable BEFORE any content creation.
    save();
    if (!journal.complete) {
      if (await guard.can('Workspace_CreateDoc') !== true) {
        throw new Error('没有创建白板权限。');
      }
      assertWritable();
      const mainId = await service.ensureMainBoard();
      if (journal.mainId && journal.mainId !== mainId) {
        throw new Error('主白板已改变，请保留原样板操作记录。');
      }
      journal.mainId = mainId;
      save();
      let parentId = mainId;
      for (const [index, layer] of journal.layers.entries()) {
        await assertDoc(parentId, true);
        if (!layer.docId) {
          // A reserved/partial service failure propagates unchanged. In particular,
          // never discard its operation ID, initialize its document, or compensate.
          layer.docId = await service.createChild(parentId, LAYERS[index].title, layer.operationId);
          save();
        }
        const relation = service.relations$.value.get(layer.docId);
        if (!relation || relation.parentId !== parentId || relation.operationId !== layer.operationId) {
          throw new Error('样板层级关系尚未恢复或已改变，请重试原操作。');
        }
        await assertDoc(layer.docId, !layer.notesSaved);
        if (!layer.notesSaved) {
          const opened = docs.open(layer.docId);
          let releasePriority: (() => void) | undefined;
          try {
            releasePriority = opened.doc.addPriorityLoad(100);
            await opened.doc.waitForSyncReady();
            await assertDoc(layer.docId, true);
            insertNotes(opened.doc.blockSuiteDoc, layer.operationId, LAYERS[index].lines);
            await workspace.engine.doc.waitForUpdated(layer.docId);
            await workspace.engine.doc.waitForUpdated(workspace.id);
            layer.notesSaved = true;
            save();
          } finally {
            try { releasePriority?.(); } finally { opened.release(); }
          }
        }
        parentId = layer.docId;
      }
    }
    // Saved layers are not seeded again, even if the user subsequently edits or
    // deletes individual fixture blocks. Do not silently replace a deleted board.
    for (const layer of journal.layers) {
      if (!layer.docId) throw new Error('样板操作尚未完成。');
      await assertDoc(layer.docId, false);
      await workspace.engine.doc.waitForUpdated(layer.docId);
    }
    await workspace.engine.doc.waitForUpdated(workspace.id);
    journal.complete = true;
    save();
    return journal.layers[0].docId!;
  });
}
