import { ConflictException } from '@nestjs/common';
import type { PrismaClient, WorkspaceMainBoard } from '@prisma/client';
import test from 'ava';
import * as Y from 'yjs';

import type { EventBus } from '../../../base';
import type { PgWorkspaceDocStorageAdapter } from '../../doc';
import type { PermissionAccess } from '../../permission';
import { MainBoardService } from '../main-board';

// In-memory dependency harness: no server, DB, Redis or existing user data.
// Serial transaction emulation tests service control flow, NOT PostgreSQL locks.
function harness() {
  const root = new Y.Doc();
  root.getMap('meta').set('pages', new Y.Array());
  const records = new Map<string, WorkspaceMainBoard>();
  const pushes: Array<{ docId: string; update: Buffer }> = [];
  const events: unknown[] = [];
  const checks: string[] = [];
  let deny = '';
  let failDoc = '';
  let dropDoc = '';
  let failCommit = false;
  let reads = 0;
  let creates = 0;
  let tail = Promise.resolve();
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<WorkspaceMainBoard>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      let pending: WorkspaceMainBoard | undefined;
      try {
        const result = await callback({
          $queryRaw: async (sql: TemplateStringsArray) => {
            if (!sql.join('').includes('FOR UPDATE')) throw new Error('Missing claim lock');
            return [{ id: 'ws' }];
          },
          workspaceMainBoard: {
            findUnique: async ({ where }: { where: { workspaceId: string } }) =>
              records.get(where.workspaceId) ?? null,
            create: async ({ data }: { data: Omit<WorkspaceMainBoard, 'createdAt'> }) => {
              creates++;
              pending = { ...data, createdAt: new Date() };
              return pending;
            },
          },
        });
        if (failCommit) throw new Error('commit failed');
        if (pending) records.set(pending.workspaceId, pending);
        return result;
      } finally {
        release();
      }
    },
  } as unknown as PrismaClient;
  const assert = async (key: string) => {
    checks.push(key);
    if (key === deny) throw new Error('denied');
  };
  const ac = {
    user: () => ({
      workspace: () => ({ assert: (action: string) => assert(action) }),
      doc: (_ws: string, docId: string) => ({
        assert: (action: string) => assert(docId + ':' + action),
      }),
    }),
  } as unknown as PermissionAccess;
  const storage = {
    getDocBinNative: async (ws: string, docId: string) => {
      if (ws !== docId) throw new Error('Must not read content');
      reads++;
      return Y.encodeStateAsUpdate(root);
    },
    pushDocUpdates: async (_ws: string, docId: string, updates: Buffer[]) => {
      if (!records.size) throw new Error('Push before commit');
      pushes.push({ docId, update: Buffer.from(updates[0]) });
      if (docId === failDoc || (failDoc === 'content' && docId !== 'ws')) {
        throw new Error('push failed');
      }
      if (docId === dropDoc) return 0;
      return 123;
    },
  } as unknown as PgWorkspaceDocStorageAdapter;
  const event = { emit: (...args: unknown[]) => events.push(args) } as unknown as EventBus;
  return {
    service: () => new MainBoardService(db, ac, storage, event),
    records, pushes, checks, events, root,
    get reads() { return reads; },
    get creates() { return creates; },
    deny: (key: string) => { deny = key; },
    fail: (docId: string) => { failDoc = docId; },
    drop: (docId: string) => { dropDoc = docId; },
    failCommit: () => { failCommit = true; },
  };
}

test('concurrent calls/restarted service return one persisted byte-identical bundle', async t => {
  const h = harness();
  const bundles = await Promise.all(Array.from({ length: 8 }, () => h.service().bootstrap('ws', 'user')));
  const first = bundles[0];
  for (const bundle of bundles) t.deepEqual(bundle, first);
  t.deepEqual(await h.service().bootstrap('ws', 'other-user'), first);
  t.is(h.creates, 1);
  t.is(h.reads, 1);
  t.is(h.records.size, 1);
  for (const push of h.pushes) {
    t.is(push.update.toString('base64'), push.docId === 'ws' ? first.rootUpdate : first.contentUpdate);
  }
  t.is(h.events.length, h.pushes.length);
  const content = new Y.Doc();
  Y.applyUpdate(content, Buffer.from(first.contentUpdate, 'base64'));
  Y.applyUpdate(content, Buffer.from(first.contentUpdate, 'base64'));
  const blocks = Array.from(content.getMap<Y.Map<unknown>>('blocks').values());
  const pages = blocks.filter(block => block.get('sys:flavour') === 'affine:page');
  const surfaces = blocks.filter(block => block.get('sys:flavour') === 'affine:surface');
  t.is(pages.length, 1);
  t.is(surfaces.length, 1);
  t.is(String(pages[0].get('prop:title')), '主白板');
  t.true(pages[0].get('sys:children') instanceof Y.Array);
  const children = pages[0].get('sys:children') as Y.Array<string>;
  t.true(children.toArray().includes(surfaces[0].get('sys:id') as string));
  const title = pages[0].get('prop:title') as Y.Text;
  title.delete(0, title.length);
  title.insert(0, 'Later user edit');
  Y.applyUpdate(content, Buffer.from(first.contentUpdate, 'base64'));
  t.is(title.toString(), 'Later user edit');
  content.destroy();
  h.root.destroy();
});

test('root push failure persists identity; retry does not rebuild or reread root', async t => {
  const h = harness();
  h.fail('ws');
  await t.throwsAsync(h.service().bootstrap('ws', 'user'), { message: 'push failed' });
  const persisted = h.records.get('ws')!;
  t.deepEqual(h.pushes.map(push => push.docId), [persisted.docId, 'ws']);
  t.is(h.events.length, 1); // content accepted before root failure
  h.fail('');
  h.root.getMap('meta').delete('pages');
  const result = await h.service().bootstrap('ws', 'user');
  t.is(result.docId, persisted.docId);
  t.is(result.rootUpdate, Buffer.from(persisted.rootUpdate).toString('base64'));
  t.is(result.contentUpdate, Buffer.from(persisted.contentUpdate).toString('base64'));
  t.is(h.reads, 1);
  t.is(h.creates, 1);
  h.root.destroy();
});

test('content push failure and dropped updates stay retryable with original bundle', async t => {
  const h = harness();
  h.fail('content');
  await t.throwsAsync(h.service().bootstrap('ws', 'user'), { message: 'push failed' });
  const persisted = h.records.get('ws')!;
  t.is(h.pushes.length, 1); // content failed; root not advertised
  t.is(h.events.length, 0);
  const result = {
    version: 1,
    docId: persisted.docId,
    rootUpdate: Buffer.from(persisted.rootUpdate).toString('base64'),
    contentUpdate: Buffer.from(persisted.contentUpdate).toString('base64'),
  };
  h.fail('');
  h.drop(result.docId);
  await t.throwsAsync(h.service().bootstrap('ws', 'user'));
  h.drop('');
  t.deepEqual(await h.service().bootstrap('ws', 'user'), result);
  t.is(h.creates, 1);
  t.is(h.reads, 1);
  h.root.destroy();
});

test('commit failure never publishes uncommitted seed', async t => {
  const h = harness();
  h.failCommit();
  await t.throwsAsync(h.service().bootstrap('ws', 'user'), { message: 'commit failed' });
  t.is(h.records.size, 0);
  t.is(h.pushes.length, 0);
  h.root.destroy();
});

test('unready root yields 409 without claim or writes', async t => {
  const h = harness();
  h.root.getMap('meta').delete('pages');
  await t.throwsAsync(h.service().bootstrap('ws', 'user'), { instanceOf: ConflictException });
  t.is(h.records.size, 0);
  t.is(h.pushes.length, 0);
  h.root.destroy();
});

test('authentication and workspace/root permissions are checked before reads or claim', async t => {
  const h = harness();
  await t.throwsAsync(h.service().bootstrap('ws', ''));
  for (const key of ['Workspace.Read', 'Workspace.CreateDoc', 'ws:Doc.Read', 'ws:Doc.Update']) {
    h.deny(key);
    await t.throwsAsync(h.service().bootstrap('ws', 'user'), { message: 'denied' });
  }
  t.is(h.reads, 0);
  t.is(h.records.size, 0);
  t.is(h.pushes.length, 0);
  h.root.destroy();
});

test('existing bundle still enforces workspace, root and main doc read/write permissions', async t => {
  const h = harness();
  const result = await h.service().bootstrap('ws', 'user');
  const count = h.pushes.length;
  for (const key of [
    'Workspace.Read', 'Workspace.CreateDoc', 'ws:Doc.Read', 'ws:Doc.Update',
    result.docId + ':Doc.Read', result.docId + ':Doc.Update',
  ]) {
    h.deny(key);
    await t.throwsAsync(h.service().bootstrap('ws', 'user'), { message: 'denied' });
  }
  t.is(h.pushes.length, count);
  t.is(h.reads, 1);
  t.is(h.creates, 1);
  h.root.destroy();
});
