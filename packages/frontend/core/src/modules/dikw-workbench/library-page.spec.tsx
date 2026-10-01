/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
const state = vi.hoisted(() => ({ services: new Map<string, any>(), kinds: new Map<string, string>(), assign: vi.fn(), listeners: new Set<() => void>() }));
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
  state.services.set('workspace', { workspace: { rootYDoc: {}, openOptions: { isSharedMode: false } } });
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
    expect(screen.getByRole('alert').textContent).toContain('未更改归属');
  });
});
