/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';

const state = vi.hoisted(() => ({ services: new Map<string, any>(), permissions: new Map<string, any>() }));
vi.mock('@affine/core/modules/doc', () => ({ DocsService: 'docs' }));
vi.mock('@affine/core/modules/permissions', () => ({ GuardService: 'guard' }));
vi.mock('@affine/core/modules/workbench', () => ({ WorkbenchService: 'workbench' }));
vi.mock('@affine/core/modules/workspace', () => ({ WorkspaceService: 'workspace' }));
vi.mock('./service', () => ({
  DikwWorkbenchService: 'board',
  DikwChildCreationError: class extends Error {
    constructor(public docId: string, public operationId: string, cause: unknown) { super('创建部分完成', { cause }); }
  },
}));
vi.mock('@affine/core/components/guard', () => ({ useGuard: () => true }));
vi.mock('./views', () => ({ BoardNavigation: (props: any) => <div>
  <span data-testid="path">{props.path.map((item: any) => item.title).join('/')}</span>
  <span data-testid="children">{props.childrenList.map((item: any) => item.title).join('/')}</span>
  <button onClick={props.onReference}>引用已有白板</button>
  <button disabled={!props.canCreate || props.busy} onClick={() => { void props.onCreateChild('子板名称').catch(() => {}); }}>创建子板</button>
  {props.error && <p role="alert">{props.error}</p>}
</div> }));
vi.mock('@toeverything/infra', async () => {
  const { useEffect, useState } = await import('react');
  const { BehaviorSubject } = await import('rxjs');
  return {
    useService: (token: string) => state.services.get(token),
    LiveData: { from: (source: any, initial: any) => {
      const subject = new BehaviorSubject(initial);
      source.subscribe((value: any) => subject.next(value));
      return subject;
    } },
    useLiveData: (source: any) => {
      const [value, setValue] = useState(source.value);
      useEffect(() => { const sub = source.subscribe((next: any) => setValue(next)); return () => sub.unsubscribe(); }, [source]);
      return value;
    },
  };
});

import { ConnectedBoardNavigation } from './connected-navigation';
import { DikwChildCreationError } from './service';

afterEach(cleanup);
let records: Map<string, any>;
let guard: any;
let board: any;
beforeEach(() => {
  state.services.clear(); state.permissions.clear();
  records = new Map(['root', 'child', 'secret', 'target'].map(id => [id, { title$: { value: id }, trash$: { value: false } }]));
  for (const id of records.keys()) state.permissions.set(id, new BehaviorSubject(id !== 'secret'));
  guard = { can$: (_: string, id: string) => state.permissions.get(id), revalidateCan: vi.fn(), can: vi.fn(async () => true) };
  board = { relations$: new BehaviorSubject(new Map([['root', {}]])), getPath: () => ({ ids: ['root'], problem: null }), getChildren: () => [{ docId: 'child' }, { docId: 'secret' }, { docId: 'missing' }], addReference: vi.fn(async () => undefined), createChild: vi.fn() };
  state.services.set('guard', guard);
  state.services.set('board', board);
  state.services.set('docs', { list: { nonTrashDocsIds$: new BehaviorSubject([...records.keys()]), doc$: (id: string) => ({ value: records.get(id) }) }, allDocTitle$: () => of([]) });
  state.services.set('workspace', { workspace: { openOptions: { isSharedMode: false } } });
  state.services.set('workbench', { workbench: { open: vi.fn() } });
});

describe('connected board navigation', () => {
  test('revalidates per-doc permissions and reacts to revocation without exposing denied children', async () => {
    render(<ConnectedBoardNavigation docId="root" readonly={false} />);
    await waitFor(() => expect(screen.getByTestId('children').textContent).toBe('child'));
    expect(guard.revalidateCan).toHaveBeenCalledWith('Doc_Read', 'child');
    await act(async () => state.permissions.get('child').next(false));
    expect(screen.getByTestId('children').textContent).toBe('');
    await act(async () => state.permissions.get('root').next(false));
    expect(screen.getByTestId('path').textContent).toBe('');
  });

  test('reference picker shows only readable existing documents and calls only addReference', async () => {
    render(<ConnectedBoardNavigation docId="root" readonly={false} />);
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('root'));
    fireEvent.click(screen.getByText('引用已有白板'));
    expect(screen.queryByRole('option', { name: 'secret' })).toBeNull();
    fireEvent.change(screen.getByLabelText('选择工作区已有文档'), { target: { value: 'target' } });
    fireEvent.submit(screen.getByRole('form', { name: '引用已有文档' }));
    await waitFor(() => expect(board.addReference).toHaveBeenCalledWith('root', 'target'));
    expect(board.createChild).not.toHaveBeenCalled();
  });

  test('partial error retains operation id and exposes only an existing readable child', async () => {
    board.createChild.mockImplementation(async (_: string, __: string, op: string) => { throw new DikwChildCreationError('child', op, new Error()); });
    render(<ConnectedBoardNavigation docId="root" readonly={false} />);
    await waitFor(() => expect((screen.getByText('创建子板') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('创建子板'));
    await screen.findByText('查看已创建白板');
    const operation = board.createChild.mock.calls[0][2];
    expect(screen.getByText(operation)).toBeTruthy();
    fireEvent.click(screen.getByText('重试原创建操作'));
    await waitFor(() => expect(board.createChild).toHaveBeenCalledTimes(2));
    expect(board.createChild.mock.calls[1][2]).toBe(operation);
  });

  test('reserved but missing document never exposes a recovery navigation button', async () => {
    board.createChild.mockImplementation(async (_: string, __: string, op: string) => { throw new DikwChildCreationError('missing', op, new Error()); });
    render(<ConnectedBoardNavigation docId="root" readonly={false} />);
    await waitFor(() => expect((screen.getByText('创建子板') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('创建子板'));
    await screen.findByText('重试原创建操作');
    expect(screen.queryByText('查看已创建白板')).toBeNull();
  });
});
