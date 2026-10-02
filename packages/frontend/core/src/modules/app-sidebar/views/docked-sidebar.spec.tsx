// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sidebar: {
    open$: { value: true },
    hovering$: { value: false },
    smallScreenMode$: { value: false },
    resizing$: { value: false },
    width$: { value: 248 },
    setOpen: vi.fn(),
    setHovering: vi.fn(),
    setResizing: vi.fn(),
    setWidth: vi.fn(),
    toggleSidebar: vi.fn(),
  },
  workbench: { views$: { value: [] } },
  toggleTracking: vi.fn(),
}));

vi.mock('../services/app-sidebar', () => ({ AppSidebarService: 'sidebar' }));
vi.mock('../../workbench', () => ({ WorkbenchService: 'workbench' }));
vi.mock('../../workspace', () => ({ WorkspaceService: 'workspace' }));
vi.mock('../../workbench/view/split-view/types', () => ({
  allowedSplitViewEntityTypes: new Set(),
}));
vi.mock('@affine/core/modules/notification', () => ({
  NotificationCountService: 'notifications',
}));
vi.mock('@toeverything/infra', () => ({
  useService: (token: string) => {
    if (token === 'sidebar') return { sidebar: state.sidebar };
    if (token === 'workbench') return { workbench: state.workbench };
    if (token === 'notifications') {
      return {
        count$: {
          selector: (select: (n: number) => boolean) => ({ value: select(0) }),
        },
      };
    }
    throw new Error('Unexpected service: ' + token);
  },
  // These fixtures are snapshots: explicitly rerender after changing a value.
  useLiveData: (source: { value: unknown }) => source.value,
  useServiceOptional: () => undefined,
}));
vi.mock('@affine/core/components/hooks/affine/use-app-setting-helper', () => ({
  useAppSettingHelper: () => ({ appSettings: { clientBorder: false } }),
}));
vi.mock('@affine/core/components/hooks/use-navigate-helper', async () => ({
  NavigateContext: (await import('react')).createContext(undefined),
}));
vi.mock('@affine/core/components/workspace-selector', () => ({
  WorkspaceNavigator: () => null,
}));
vi.mock('@affine/i18n', () => ({
  useI18n: () => new Proxy({}, { get: (_, key) => () => String(key) }),
}));
vi.mock('@affine/track', () => ({
  track: { $: { navigationPanel: { $: { toggle: state.toggleTracking } } } },
}));
vi.mock('@affine/component', () => ({
  Skeleton: () => null,
  IconButton: ({
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string }) => (
    <button {...props} />
  ),
}));
vi.mock('@affine/component/resize-panel', () => ({
  // Expose the production component's decisions, not ResizePanel internals.
  // Keep children mounted when closed, like unmountOnExit={false} in AppSidebar.
  ResizePanel: ({
    children,
    open,
    floating,
    width,
    onMouseEnter,
    onMouseLeave,
  }: {
    children?: ReactNode;
    open: boolean;
    floating: boolean;
    width: number;
    onMouseEnter?: HTMLAttributes<HTMLDivElement>['onMouseEnter'];
    onMouseLeave?: HTMLAttributes<HTMLDivElement>['onMouseLeave'];
  }) => (
    <div
      data-testid="resize-panel"
      data-open={open}
      data-is-floating={floating}
      data-width={width}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  ),
}));
vi.mock('./index.css', () => ({
  navBodyStyle: 'sidebar-body',
  navHeaderStyle: 'sidebar-header',
  navStyle: 'sidebar-nav',
  navWrapperStyle: 'sidebar-wrapper',
  hoverNavWrapperStyle: 'sidebar-hover-wrapper',
  sidebarFloatMaskStyle: 'sidebar-float-mask',
  resizeHandleShortcutStyle: 'resize-shortcut',
}));
vi.mock('./fallback.css', () => ({}));
vi.mock('./sidebar-header/sidebar-switch.css', () => ({
  sidebarSwitchClip: 'sidebar-switch-clip',
}));

// Keep the actual AppSidebar -> SidebarHeader -> SidebarSwitch composition.
import { AppSidebar } from './index';
import { SidebarSwitch } from './sidebar-header/sidebar-switch';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('BUILD_CONFIG', { ...BUILD_CONFIG, isElectron: false });
  state.sidebar.open$.value = true;
  state.sidebar.hovering$.value = false;
  state.sidebar.smallScreenMode$.value = false;
  state.sidebar.resizing$.value = false;
  state.sidebar.width$.value = 248;
  state.sidebar.setHovering.mockImplementation((value: boolean) => {
    state.sidebar.hovering$.value = value;
  });
  state.sidebar.toggleSidebar.mockImplementation(() => {
    state.sidebar.open$.value = !state.sidebar.open$.value;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sidebar() {
  return (
    <AppSidebar
      headerContent={<div data-testid="header-content">Workspace</div>}
    >
      <div data-testid="body-content">Documents</div>
    </AppSidebar>
  );
}

function expectDocked(open: boolean) {
  const panel = screen.getByTestId('resize-panel');
  expect(panel.getAttribute('data-open')).toBe(String(open));
  expect(panel.getAttribute('data-is-floating')).toBe('false');
  expect(document.querySelector('[data-is-floating="true"]')).toBeNull();
}

describe('docked application sidebar', () => {
  it('stays closed when stale hover state is true and never requests a floating panel', () => {
    state.sidebar.open$.value = false;
    const view = render(sidebar());
    expectDocked(false);

    state.sidebar.hovering$.value = true;
    view.rerender(sidebar());
    expectDocked(false);
    expect(state.sidebar.setOpen).not.toHaveBeenCalled();
    expect(state.sidebar.toggleSidebar).not.toHaveBeenCalled();
  });

  it('stays open and docked when entering small-screen mode', () => {
    const view = render(sidebar());
    expectDocked(true);

    state.sidebar.smallScreenMode$.value = true;
    state.sidebar.hovering$.value = true;
    view.rerender(sidebar());
    expectDocked(true);
  });

  it('clamps a stored 480px width to 324px at a 420px viewport without saving it', () => {
    vi.stubGlobal('innerWidth', 420);
    state.sidebar.width$.value = 480;
    render(sidebar());
    expectDocked(true);
    expect(screen.getByTestId('resize-panel').getAttribute('data-width')).toBe(
      '324'
    );
    expect(state.sidebar.width$.value).toBe(480);
    expect(state.sidebar.setWidth).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'renders header content exactly once outside the body (electron=%s)',
    isElectron => {
      vi.stubGlobal('BUILD_CONFIG', { ...BUILD_CONFIG, isElectron });
      render(sidebar());
      const headerContent = screen.getByTestId('header-content');
      const body = screen.getByTestId('sliderBar-inner');
      const nav = screen.getByTestId('app-sidebar');
      const header = nav.querySelector('.sidebar-header');

      expect(screen.getAllByTestId('header-content')).toHaveLength(1);
      expect(nav.querySelectorAll('.sidebar-header')).toHaveLength(1);
      expect(header?.contains(headerContent)).toBe(true);
      expect(body.contains(headerContent)).toBe(false);
      expect(body.contains(screen.getByTestId('body-content'))).toBe(true);
      expect(nav.firstElementChild).toBe(header);
      expect(header?.nextElementSibling).toBe(body);
      expect(
        header?.contains(screen.getByRole('button', { name: '收起侧栏' }))
      ).toBe(true);
    }
  );

  it('collapse click clears hover and toggles the sidebar closed', () => {
    state.sidebar.hovering$.value = true;
    const view = render(sidebar());
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }));

    expect(state.sidebar.setHovering).toHaveBeenCalledTimes(1);
    expect(state.sidebar.setHovering).toHaveBeenCalledWith(false);
    expect(state.sidebar.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(state.toggleTracking).toHaveBeenCalledWith({ type: 'collapse' });
    view.rerender(sidebar());
    expectDocked(false);
  });

  it.each([false, true])(
    'mouseenter on the visible switch never enables hovering (open=%s)',
    open => {
      state.sidebar.open$.value = open;
      render(<SidebarSwitch show />);
      const clip = screen.getByTestId(
        'app-sidebar-arrow-button-' + (open ? 'collapse' : 'expand')
      );
      fireEvent.mouseEnter(clip);
      fireEvent.mouseEnter(screen.getByRole('button'));
      expect(state.sidebar.setHovering).not.toHaveBeenCalled();
      expect(state.sidebar.toggleSidebar).not.toHaveBeenCalled();
    }
  );

  it.each([
    { open: false, hovering: true, smallScreen: false },
    { open: true, hovering: false, smallScreen: true },
    { open: true, hovering: true, smallScreen: true },
  ])('renders no floating mask for %j', ({ open, hovering, smallScreen }) => {
    state.sidebar.open$.value = open;
    state.sidebar.hovering$.value = hovering;
    state.sidebar.smallScreenMode$.value = smallScreen;
    const { container } = render(sidebar());
    expectDocked(open);
    expect(container.querySelector('.sidebar-float-mask')).toBeNull();
    // A sibling overlay must not be introduced under a different class name.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(
      screen.getByTestId('resize-panel')
    );
    fireEvent.mouseEnter(screen.getByTestId('resize-panel'));
    expect(state.sidebar.setHovering).not.toHaveBeenCalledWith(true);
  });
});
