/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
const state = vi.hoisted(() => ({ services: new Map<string, any>(), kinds: new Map<string, string>(), assign: vi.fn(), listeners: new Set<() => void>() }));
vi.mock('nanoid', () => ({ nanoid: () => 'created-doc' }));
vi.mock('@affine/component', () => ({ Button: (props: any) => <button type="button" {...props} /> }));
vi.mock('@affine/core/modules/doc', () => ({ DocsService: 'docs' }));
vi.mock('@affine/core/modules/permissions', () => ({ GuardService: 'guard' }));
vi.mock('@affine/core/modules/workbench', () => ({ WorkbenchService: 'workbench' }));
vi.mock('@affine/core/modules/workspace', () => ({ WorkspaceService: 'workspace' }));
vi.mock('./service', () => ({ DikwWorkbenchService: 'board' }));
vi.mock('@affine/core/components/guard', () => ({ useGuard: () => true }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/knowledge' }) }));
vi.mock('./connected-navigation', () => ({ useReadableDocIds: (ids: string[]) => new Set(ids.filter(id => id !== 'secret')) }));
vi.mock('./content-repository', () => ({ ContentRepository: class {
  getKind(id: string) { return state.kinds.get(id) ?? null; }
  assign(id: string, kind: string) { state.assign(id, kind); state.kinds.set(id, kind); state.listeners.forEach(fn => fn()); }
  observe(fn: () => void) { state.listeners.add(fn); return () => { state.listeners.delete(fn); }; }
} }));
vi.mock('@toeverything/infra', async () => {
  const { useEffect, useState } = await import('react');
  return { useService: (token: string) => state.services.get(token), useLiveData: (source: any) => {
    const [value, setValue] = useState(source.value);
    useEffect(() => { const sub = source.subscribe((next: any) => setValue(next)); return () => sub.unsubscribe(); }, [source]);
    return value;
  } };
});
import { Component } from './library-page';
afterEach(cleanup);
let records: Map<string, any>;
let guard: any;
beforeEach(() => {
  state.services.clear(); state.kinds.clear(); state.listeners.clear(); state.assign.mockReset();
  records = new Map(['existing', 'secret', 'board'].map(id => [id, { id, title$: new BehaviorSubject(id), trash$: new BehaviorSubject(false) }]));
  guard = { can: vi.fn(async () => true) };
  state.services.set('guard', guard);
  state.services.set('docs', { list: { nonTrashDocsIds$: new BehaviorSubject([...records.keys()]), doc$: (id: string) => ({ value: records.get(id) }) }, createDoc: vi.fn() });
  state.services.set('board', { relations$: new BehaviorSubject(new Map([['board', {}]])) });
  state.services.set('workspace', { workspace: { id: 'workspace', rootYDoc: {}, openOptions: { isSharedMode: false }, engine: { doc: { waitForDocLoaded: vi.fn(async () => {}), waitForUpdated: vi.fn(async () => {}) } } } });
  state.services.set('workbench', { workbench: { open: vi.fn(), openDoc: vi.fn() } });
});
describe('library explicit ownership', () => {
  test('lists readable unassigned documents without assigning on render', () => {
    render(<Component />);
    const list = screen.getByRole('list', { name: '未归档文档' });
    expect(within(list).getByText('existing')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.queryByText('board')).toBeNull();
    expect(state.assign).not.toHaveBeenCalled();
  });
  test('explicit assignment moves an existing document into the chosen library', async () => {
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: '归入知识库' }));
    await waitFor(() => expect(state.assign).toHaveBeenCalledExactlyOnceWith('existing', 'knowledge'));
    expect(within(screen.getByRole('list', { name: '知识库内容' })).getByText('existing')).toBeTruthy();
  });
  test('explicit assignment waits for root persistence', async () => {
    const engine = state.services.get('workspace').workspace.engine.doc;
    let finish!: () => void;
    engine.waitForUpdated.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: '归入知识库' }));
    await waitFor(() => expect(engine.waitForUpdated).toHaveBeenCalledExactlyOnceWith('workspace'));
    expect(state.assign).toHaveBeenCalledExactlyOnceWith('existing', 'knowledge');
    await act(async () => finish());
  });
  test('create waits for native load, content save and root save before navigating or clearing', async () => {
    const docs = state.services.get('docs');
    const engine = state.services.get('workspace').workspace.engine.doc;
    const workbench = state.services.get('workbench').workbench;
    docs.createDoc.mockImplementation(({ id }: { id: string }) => ({ id }));
    let loaded!: () => void;
    let contentSaved!: () => void;
    let rootSaved!: () => void;
    engine.waitForDocLoaded.mockImplementation(() => new Promise<void>(resolve => { loaded = resolve; }));
    engine.waitForUpdated.mockImplementation((id: string) => new Promise<void>(resolve => {
      if (id === 'workspace') rootSaved = resolve; else contentSaved = resolve;
    }));
    render(<Component />);
    const input = screen.getByRole('textbox', { name: '新文档名称' }) as HTMLInputElement;
    const submit = screen.getByRole('button', { name: '新建资料' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: 'My material' } });
    fireEvent.submit(screen.getByRole('form', { name: '新建库文档' }));
    await waitFor(() => expect(engine.waitForDocLoaded).toHaveBeenCalledWith('created-doc'));
    expect(docs.createDoc).toHaveBeenCalledExactlyOnceWith({ id: 'created-doc', title: 'My material', primaryMode: 'page' });
    expect(engine.waitForUpdated).not.toHaveBeenCalled();
    expect(state.assign).not.toHaveBeenCalled();
    await act(async () => loaded());
    expect(engine.waitForUpdated).toHaveBeenCalledExactlyOnceWith('created-doc');
    expect(workbench.openDoc).not.toHaveBeenCalled();
    expect(state.assign).not.toHaveBeenCalled();
    expect(input.value).toBe('My material');
    expect(submit.disabled).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: '新建库文档' }));
    expect(docs.createDoc).toHaveBeenCalledTimes(1);
    await act(async () => contentSaved());
    expect(state.assign).toHaveBeenCalledExactlyOnceWith('created-doc', 'knowledge');
    expect(engine.waitForUpdated).toHaveBeenNthCalledWith(2, 'workspace');
    expect(workbench.openDoc).not.toHaveBeenCalled();
    expect(input.value).toBe('My material');
    await act(async () => rootSaved());
    expect(workbench.openDoc).toHaveBeenCalledExactlyOnceWith('created-doc');
    expect(input.value).toBe('');
  });
  test('native create throwing after mutation retains identity and prevents another creation', async () => {
    const docs = state.services.get('docs');
    const workbench = state.services.get('workbench').workbench;
    docs.createDoc.mockImplementation(({ id, title }: { id: string; title: string }) => {
      records.set(id, { id, title$: new BehaviorSubject(title), trash$: new BehaviorSubject(false) });
      docs.list.nonTrashDocsIds$.next([...records.keys()]);
      throw new Error('afterCreate failed after root insertion');
    });
    render(<Component />);
    const input = screen.getByRole('textbox', { name: '新文档名称' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Keep me' } });
    fireEvent.submit(screen.getByRole('form', { name: '新建库文档' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('状态待确认'));
    expect(input.value).toBe('Keep me');
    expect(input.disabled).toBe(true);
    expect(state.assign).not.toHaveBeenCalled();
    expect(workbench.openDoc).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('form', { name: '新建库文档' }));
    expect(docs.createDoc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '查看已创建文档' }));
    await waitFor(() => expect(workbench.openDoc).toHaveBeenCalledExactlyOnceWith('created-doc'));
  });
  test('guards duplicate assignment and refuses a document deleted during permission await', async () => {
    let resolve!: (allowed: boolean) => void;
    guard.can.mockImplementation(() => new Promise<boolean>(done => { resolve = done; }));
    render(<Component />);
    const button = screen.getByRole('button', { name: '归入知识库' });
    fireEvent.click(button); fireEvent.click(button);
    expect(guard.can).toHaveBeenCalledTimes(1);
    records.delete('existing');
    // The second permission check resolves immediately; the post-await existence check must fail.
    guard.can.mockResolvedValue(true);
    await act(async () => resolve(true));
    expect(state.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('归属更改未确认');
  });
});
