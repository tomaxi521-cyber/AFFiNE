/** @vitest-environment happy-dom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { BoardNavigation, type BoardNavigationProps } from './board-navigation';

// These tests exercise props and DOM semantics, not theme rendering or services.
vi.mock('./board-navigation.css', () => ({
  container: '',
  breadcrumbs: '',
  crumb: '',
  current: '',
  actions: '',
  textButton: '',
  button: '',
  form: '',
  input: '',
  error: '',
  status: '',
  heading: '',
  children: '',
  childButton: '',
  hint: '',
}));

afterEach(cleanup);

const root = { id: 'root', title: '主白板' };
const parent = { id: 'parent', title: '项目' };
const current = { id: 'current', title: '研究' };
const child = { id: 'child', title: '下一步' };

const setup = (overrides: Partial<BoardNavigationProps> = {}) => {
  const props: BoardNavigationProps = {
    path: [root, parent, current],
    childrenList: [child],
    canCreate: true,
    onNavigate: vi.fn(),
    onCreateChild: vi.fn(async () => undefined),
    ...overrides,
  };
  return { props, ...render(<BoardNavigation {...props} />) };
};

const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;
const openForm = () => fireEvent.click(button('新建子白板'));
const input = () =>
  screen.getByRole('textbox', { name: '子白板名称' }) as HTMLInputElement;
const submit = () =>
  fireEvent.submit(screen.getByRole('form', { name: '新建子白板' }));

describe('BoardNavigation', () => {
  test('renders only supplied logical ancestry and navigates by id', () => {
    const { props } = setup();
    const nav = screen.getByRole('navigation', { name: '白板层级路径' });
    expect(within(nav).getByText('研究').getAttribute('aria-current')).toBe(
      'page'
    );
    fireEvent.click(button('返回父白板'));
    expect(props.onNavigate).toHaveBeenLastCalledWith('parent');
    fireEvent.click(button('返回主白板'));
    expect(props.onNavigate).toHaveBeenLastCalledWith('root');
    fireEvent.click(within(nav).getByRole('button', { name: '项目' }));
    expect(props.onNavigate).toHaveBeenLastCalledWith('parent');
    fireEvent.click(button('下一步'));
    expect(props.onNavigate).toHaveBeenLastCalledWith('child');
  });

  test('root and empty paths never invent a parent or main destination', () => {
    const { props, rerender } = setup({ path: [root], childrenList: [] });
    expect(button('返回父白板').disabled).toBe(true);
    expect(button('返回主白板').disabled).toBe(true);
    expect(screen.getByText('暂无子白板。')).toBeTruthy();
    rerender(<BoardNavigation {...props} path={[]} />);
    expect(button('新建子白板').disabled).toBe(true);
    expect(screen.getByText('尚未选择白板。')).toBeTruthy();
  });

  test('shows ordinary reference as an independent action, never an ancestor', () => {
    const onReference = vi.fn();
    const { props } = setup({ onReference, canReference: true });
    fireEvent.click(button('引用已有白板'));
    expect(onReference).toHaveBeenCalledTimes(1);
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation').textContent).toBe('主白板/项目/研究');
  });

  test('permissions fail closed for mutations and can disable navigation', () => {
    const { props, rerender } = setup({
      canCreate: undefined,
      onReference: vi.fn(),
      canNavigate: false,
    });
    expect(button('新建子白板').disabled).toBe(true);
    expect(button('引用已有白板').disabled).toBe(true);
    expect(button('下一步').disabled).toBe(true);
    rerender(
      <BoardNavigation {...props} canCreate canNavigate canReference busy />
    );
    for (const control of screen.getAllByRole('button')) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByRole('status').textContent).toBe('正在加载白板…');
  });

  test('focuses inline naming form and returns focus on Escape without creation', () => {
    const { props } = setup();
    openForm();
    expect(document.activeElement).toBe(input());
    fireEvent.change(input(), { target: { value: '草稿' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('form')).toBeNull();
    expect(document.activeElement).toBe(button('新建子白板'));
    expect(props.onCreateChild).not.toHaveBeenCalled();
  });

  test('rejects whitespace with an accessible field error', () => {
    const { props } = setup();
    openForm();
    fireEvent.change(input(), { target: { value: '   ' } });
    submit();
    expect(screen.getByRole('alert').textContent).toBe('请输入子白板名称。');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe(
      screen.getByRole('alert').id
    );
    expect(props.onCreateChild).not.toHaveBeenCalled();
  });

  test('trims title, suppresses duplicate submissions, and closes only after success', async () => {
    let resolve!: () => void;
    const onCreateChild = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    setup({ onCreateChild });
    openForm();
    fireEvent.change(input(), { target: { value: '  实验  ' } });
    submit();
    submit();
    expect(onCreateChild).toHaveBeenCalledExactlyOnceWith('实验');
    expect(input().value).toBe('  实验  ');
    expect(button('正在创建…').disabled).toBe(true);
    expect(button('取消').disabled).toBe(true);
    await act(async () => resolve());
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('子白板已创建。');
    expect(document.activeElement).toBe(button('新建子白板'));
  });

  test('keeps failed title and allows an explicit retry', async () => {
    const onCreateChild = vi
      .fn()
      .mockRejectedValueOnce(new Error('保存失败，请检查连接。'))
      .mockResolvedValueOnce(undefined);
    setup({ onCreateChild });
    openForm();
    fireEvent.change(input(), { target: { value: '不能丢失的标题' } });
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '保存失败，请检查连接。'
      )
    );
    expect(input().value).toBe('不能丢失的标题');
    expect(button('创建').disabled).toBe(false);
    submit();
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    expect(onCreateChild).toHaveBeenCalledTimes(2);
  });

  test('uses a clear fallback for unknown failures', async () => {
    setup({ onCreateChild: vi.fn().mockRejectedValue(null) });
    openForm();
    fireEvent.change(input(), { target: { value: '研究' } });
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '创建子白板失败，请重试。'
      )
    );
  });

  test('shows host errors and retry without a misleading empty state', () => {
    const onRetry = vi.fn();
    setup({ error: '无法读取子白板。', onRetry, childrenList: [] });
    expect(screen.getByRole('alert').textContent).toContain('无法读取子白板。');
    expect(screen.queryByText('暂无子白板。')).toBeNull();
    fireEvent.click(button('重试'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('resets naming state across boards and ignores a stale async failure', async () => {
    let reject!: (reason: Error) => void;
    const { props, rerender } = setup({
      onCreateChild: vi.fn(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          })
      ),
    });
    openForm();
    fireEvent.change(input(), { target: { value: '旧板标题' } });
    submit();
    rerender(<BoardNavigation {...props} path={[root, child]} />);
    await act(async () => reject(new Error('旧请求失败')));
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    openForm();
    expect(input().value).toBe('');
  });

  test('IME Enter is not submitted and naming keys do not reach the editor', () => {
    const onKeyDown = vi.fn();
    const onCreateChild = vi.fn(async () => undefined);
    render(
      <div onKeyDown={onKeyDown}>
        <BoardNavigation
          path={[root]}
          childrenList={[]}
          canCreate
          onNavigate={vi.fn()}
          onCreateChild={onCreateChild}
        />
      </div>
    );
    openForm();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(input(), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onCreateChild).not.toHaveBeenCalled();
  });
});
