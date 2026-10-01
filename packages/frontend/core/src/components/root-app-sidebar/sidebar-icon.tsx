import type { SVGProps } from 'react';

export type SidebarIconName =
  | 'folder'
  | 'folder-open'
  | 'board'
  | 'chevron'
  | 'plus'
  | 'documents'
  | 'more'
  | 'search'
  | 'settings'
  | 'import'
  | 'trash'
  | 'templates'
  | 'sidebar';
/** One optical grid for shell controls. Never applied to user canvas content. */
export function SidebarIcon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: SidebarIconName; size?: number }) {
  const paths: Record<SidebarIconName, React.ReactNode> = {
    folder: (
      <path d="M2.5 6V4.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6Z" />
    ),
    'folder-open': (
      <>
        <path d="M2.5 9V4.5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1V8" />
        <path d="M2.5 8.5h14a1 1 0 0 1 1 1.25l-1.5 6a1 1 0 0 1-1 .75H4a1 1 0 0 1-1-.85L1.5 9.65a1 1 0 0 1 1-1.15Z" />
      </>
    ),
    board: (
      <>
        <rect x="2.5" y="3.5" width="15" height="11" rx="1.5" />
        <path d="M7 17h6M10 14.5V17" />
      </>
    ),
    chevron: <path d="m8 5 5 5-5 5" />,
    plus: <path d="M10 4v12M4 10h12" />,
    documents: (
      <>
        <rect x="6" y="5.5" width="11" height="12" rx="1.5" />
        <path d="M13 5.5V3.5A1 1 0 0 0 12 2.5H4a1 1 0 0 0-1 1v10M9 9h5M9 12h5" />
      </>
    ),
    more: (
      <>
        <circle cx="4" cy="10" r=".9" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none" />
        <circle cx="16" cy="10" r=".9" fill="currentColor" stroke="none" />
      </>
    ),
    search: (
      <>
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m12.5 12.5 4.5 4.5" />
      </>
    ),
    settings: (
      <>
        <path d="m8 2.5-.5 2-1.5.9-2-.5-2 3.2 1.5 1.4v1.8L2 12.7l2 3.2 2-.5 1.5.9.5 2h4l.5-2 1.5-.9 2 .5 2-3.2-1.5-1.4V9.5L18 8.1l-2-3.2-2 .5-1.5-.9-.5-2Z" />
        <circle cx="10" cy="10.4" r="2.5" />
      </>
    ),
    import: (
      <>
        <path d="M10 2.5v10m-3-3 3 3 3-3M3 12.5v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 5.5h14M7 5.5v-2h6v2M4.5 5.5l.75 11a1 1 0 0 0 1 .9h7.5a1 1 0 0 0 1-.9l.75-11M8 8.5v6M12 8.5v6" />
      </>
    ),
    templates: (
      <>
        <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
      </>
    ),
    sidebar: (
      <>
        <rect x="2.5" y="3" width="15" height="14" rx="2" />
        <path d="M7.5 3v14" />
      </>
    ),
  };
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-sidebar-icon={name}
      style={{ flexShrink: 0, display: 'block', ...props.style }}
    >
      {paths[name]}
    </svg>
  );
}
