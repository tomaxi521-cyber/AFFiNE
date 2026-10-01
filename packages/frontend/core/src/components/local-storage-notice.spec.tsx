/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LocalStorageNotice } from './local-storage-notice';

vi.mock('./local-storage-notice.css', () => ({
  notice: 'notice',
  row: 'row',
  status: 'status',
  risk: 'risk',
  actions: 'actions',
  button: 'button',
  syncButton: 'syncButton',
  details: 'details',
  warning: 'warning',
}));

afterEach(cleanup);

const fullWarning =
  'Original localized warning: local browser data is temporary and may be lost. Enable cloud to sync across devices.';

function props(isLoggedIn = false) {
  return {
    isLoggedIn,
    warning: fullWarning,
    actionLabel: isLoggedIn ? 'Enable AFFiNE Cloud' : 'Sign in and Enable',
    onLogin: vi.fn(),
    onEnableCloud: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('LocalStorageNotice', () => {
  test('keeps storage location and meaningful risk visible while collapsed', () => {
    const callbacks = props();
    render(<LocalStorageNotice {...callbacks} />);
    expect(screen.getByText('仅保存在此浏览器 · 未同步')).toBeTruthy();
    expect(screen.getByText('清理浏览器数据可能丢失')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText(/已保存|保存成功|已同步/)).toBeNull();
    expect(callbacks.onLogin).not.toHaveBeenCalled();
    expect(callbacks.onEnableCloud).not.toHaveBeenCalled();
  });

  test('uses a focusable native disclosure with a stable, linked details ID', () => {
    render(<LocalStorageNotice {...props()} />);
    const toggle = screen.getByRole('button', { name: '查看详情' });
    const id = toggle.getAttribute('aria-controls');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(id!)?.hidden).toBe(true);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    // Native buttons supply Enter/Space activation; click exercises its handler.
    fireEvent.click(toggle);
    const details = screen.getByRole('region', { name: '本地存储风险详情' });
    expect(details.id).toBe(id);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(details).getByText(fullWarning).textContent).toBe(
      fullWarning
    );
    fireEvent.click(screen.getByRole('button', { name: '收起详情' }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(id);
    expect(details.hidden).toBe(true);
    expect(screen.getByText('清理浏览器数据可能丢失')).toBeTruthy();
  });

  test.each([false, true])(
    'only invokes the appropriate callback after explicit action (logged in: %s)',
    isLoggedIn => {
      const callbacks = props(isLoggedIn);
      render(<LocalStorageNotice {...callbacks} />);
      fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
      expect(callbacks.onLogin).not.toHaveBeenCalled();
      expect(callbacks.onEnableCloud).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', {
          name: isLoggedIn ? '启用同步' : '登录并启用同步',
          exact: true,
        })
      );
      fireEvent.click(
        screen.getByRole('button', { name: callbacks.actionLabel })
      );
      expect(
        isLoggedIn ? callbacks.onEnableCloud : callbacks.onLogin
      ).toHaveBeenCalledTimes(2);
      expect(
        isLoggedIn ? callbacks.onLogin : callbacks.onEnableCloud
      ).not.toHaveBeenCalled();
      expect(callbacks.onClose).not.toHaveBeenCalled();
    }
  );

  test('close preserves callback parity without enabling cloud or signing in', () => {
    const callbacks = props();
    render(<LocalStorageNotice {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭本地存储提示' }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onLogin).not.toHaveBeenCalled();
    expect(callbacks.onEnableCloud).not.toHaveBeenCalled();
  });

  test('auth state changes do not auto-sync and the next action uses the new state', () => {
    const callbacks = props();
    const { rerender } = render(<LocalStorageNotice {...callbacks} />);
    rerender(
      <LocalStorageNotice
        {...callbacks}
        isLoggedIn
        actionLabel="Enable AFFiNE Cloud"
      />
    );
    expect(callbacks.onEnableCloud).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: '启用同步', exact: true })
    );
    expect(callbacks.onEnableCloud).toHaveBeenCalledTimes(1);
    expect(callbacks.onLogin).not.toHaveBeenCalled();
    expect(screen.getByText('仅保存在此浏览器 · 未同步')).toBeTruthy();
  });

  test('multiple notices have distinct disclosure targets', () => {
    render(
      <>
        <LocalStorageNotice {...props()} />
        <LocalStorageNotice {...props()} />
      </>
    );
    const toggles = screen.getAllByRole('button', { name: '查看详情' });
    expect(toggles[0].getAttribute('aria-controls')).not.toBe(
      toggles[1].getAttribute('aria-controls')
    );
  });
});
