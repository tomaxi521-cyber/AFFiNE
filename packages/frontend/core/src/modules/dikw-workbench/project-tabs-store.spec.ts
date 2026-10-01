import { describe, expect, test, vi } from 'vitest';

vi.mock('@toeverything/infra', async () => {
  const { BehaviorSubject } = await import('rxjs');
  return {
    LiveData: class<T> extends BehaviorSubject<T> {
      setValue(value: T) {
        this.next(value);
      }
    },
  };
});

import {
  nearestProjectTab,
  parseProjectTabs,
  projectDocId,
  projectKey,
  ProjectTabsStore,
  PROJECT_TABS_STORAGE_KEY,
  type ProjectTab,
} from './project-tabs-store';

const tab = (patch: Partial<ProjectTab> = {}): ProjectTab => ({
  flavour: 'local',
  workspaceId: 'workspace',
  rootId: 'root',
  currentDocId: 'root',
  title: '工程',
  ...patch,
});
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe('project tab local navigation store', () => {
  test('uses collision-safe identity across flavour, workspace and roots', () => {
    expect(projectKey(tab({ flavour: 'a:b', workspaceId: 'c' }))).not.toBe(
      projectKey(tab({ flavour: 'a', workspaceId: 'b:c' }))
    );
    const store = new ProjectTabsStore(memory());
    [
      tab(),
      tab({ flavour: 'server-a' }),
      tab({ workspaceId: 'other' }),
      tab({ rootId: 'other-root' }),
    ].forEach(t => store.record(t));
    expect(store.tabs$.value).toHaveLength(4);
  });
  test('updates current child and reactive title without moving or duplicating root', () => {
    const storage = memory();
    const store = new ProjectTabsStore(storage);
    store.record(tab());
    store.record(tab({ rootId: 'second' }));
    store.record(tab({ currentDocId: 'child', title: '改名' }));
    expect(store.tabs$.value).toHaveLength(2);
    expect(store.tabs$.value[0]).toMatchObject({
      currentDocId: 'child',
      title: '改名',
    });
    expect(new ProjectTabsStore(storage).tabs$.value).toEqual(
      store.tabs$.value
    );
    expect(
      Object.keys(
        JSON.parse(storage.getItem(PROJECT_TABS_STORAGE_KEY)!)[0]
      ).sort()
    ).toEqual(['currentDocId', 'flavour', 'rootId', 'title', 'workspaceId']);
  });
  test('ignores closed active route until a distinct navigation arrives', () => {
    const store = new ProjectTabsStore(memory());
    store.record(tab());
    store.close(projectKey(tab()), 'route-a');
    expect(store.observeRoute('route-a')).toBe(false);
    expect(store.observeRoute('route-a')).toBe(false);
    expect(store.tabs$.value).toEqual([]);
    expect(store.observeRoute('route-b')).toBe(true);
    expect(store.observeRoute('route-a')).toBe(true);
  });
  test('closing inactive tab preserves active route tracking and selects nearest neighbour', () => {
    const a = tab(),
      b = tab({ rootId: 'b' }),
      c = tab({ rootId: 'c' });
    expect(nearestProjectTab([a, b, c], projectKey(b))).toBe(c);
    expect(nearestProjectTab([a, b], projectKey(b))).toBe(a);
    expect(nearestProjectTab([a], projectKey(a))).toBeUndefined();
    const store = new ProjectTabsStore(memory());
    store.record(a);
    store.record(b);
    store.close(projectKey(b));
    expect(store.observeRoute('a')).toBe(true);
    expect(store.tabs$.value).toEqual([a]);
  });
  test('rejects corrupt storage and sanitizes duplicate records', () => {
    for (const raw of ['{', '{}', 'null', '[1,null,{}]'])
      expect(parseProjectTabs(raw)).toEqual([]);
    expect(
      parseProjectTabs(JSON.stringify([tab(), tab({ title: 'latest' })]))
    ).toEqual([tab({ title: 'latest' })]);
    expect(
      parseProjectTabs(JSON.stringify([tab({ workspaceId: '' })]))
    ).toEqual([]);
  });
  test('notifies subscribers but avoids no-op writes and survives unavailable storage', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error();
      }),
      setItem: vi.fn(() => {
        throw new Error();
      }),
    };
    const store = new ProjectTabsStore(storage);
    const listener = vi.fn();
    const dispose = store.subscribe(listener);
    store.record(tab());
    store.record(tab());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    dispose();
  });
  test('extracts only a single document route segment defensively', () => {
    expect(projectDocId('/child')).toBe('child');
    expect(projectDocId('/hello%20world/')).toBe('hello world');
    expect(projectDocId('/workspace/x/child')).toBeUndefined();
    expect(projectDocId('/%E0%A4%A')).toBeUndefined();
    // The component additionally requires a complete getPath() and live doc existence.
  });
});
