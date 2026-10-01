// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarIcon, type SidebarIconName } from './sidebar-icon';
afterEach(cleanup);
describe('sidebar optical icon grid', () => {
  const names: SidebarIconName[] = [
    'folder',
    'folder-open',
    'board',
    'chevron',
    'plus',
    'documents',
    'more',
    'search',
    'settings',
    'import',
    'trash',
    'templates',
    'sidebar',
  ];
  it.each(names)(
    '%s uses one stroke grid without stealing button names',
    name => {
      const { container } = render(
        <button aria-label="操作">
          <SidebarIcon name={name} />
        </button>
      );
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 20 20');
      expect(svg.getAttribute('stroke-width')).toBe('1.5');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.style.flexShrink).toBe('0');
      expect(svg.getAttribute('width')).toBe('20');
      expect(svg.children.length).toBeGreaterThan(0);
    }
  );
  it('keeps an explicit optical size independent of hit area', () => {
    const { container } = render(<SidebarIcon name="board" size={18} />);
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('18');
  });
  it('distinguishes open folder and board instead of relation-tree glyphs', () => {
    const a = render(<SidebarIcon name="folder" />);
    const closed = a.container.innerHTML;
    a.unmount();
    const b = render(<SidebarIcon name="folder-open" />);
    expect(b.container.innerHTML).not.toBe(closed);
    b.unmount();
    const c = render(<SidebarIcon name="board" />);
    expect(c.container.querySelector('rect')).not.toBeNull();
    expect(c.container.querySelector('circle')).toBeNull();
  });
});
