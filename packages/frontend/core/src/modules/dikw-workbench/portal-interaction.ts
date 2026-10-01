import { BoardRepository } from './board-repository';
import type { Doc } from 'yjs';

type PortalElement = HTMLElement & { store?: { id: string }; model?: { props: { pageId?: string } } };
/** Only the current board's direct child previews; ordinary synced references retain native behaviour. */
export function getChildPortalTarget(event: MouseEvent, source: string, root: Doc): string | null {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const elements = event.composedPath().filter((item): item is PortalElement => item instanceof HTMLElement);
  const portal = elements.find(item => item.tagName.toLowerCase() === 'affine-embed-edgeless-synced-doc-block' && item.store?.id === source);
  const target = portal?.model?.props.pageId;
  if (!target || new BoardRepository(root).snapshot().get(target)?.parentId !== source) return null;
  return target;
}

export function bindChildPortalNavigation(element: HTMLElement, options: {
  source: string; root: Doc; available: (id: string) => boolean;
  canRead: (id: string) => Promise<boolean>; navigate: (id: string) => void;
  onError: () => void;
}): () => void {
  let disposed = false, navigating = false;
  const handle = (event: MouseEvent) => {
    const target = getChildPortalTarget(event, options.source, options.root);
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (navigating) return;
    navigating = true;
    void (async () => {
      try {
        if (!options.available(target) || !await options.canRead(target) || !options.available(target)) throw new Error('Unavailable');
        if (!disposed) options.navigate(target);
      } catch { if (!disposed) options.onError(); }
      finally { navigating = false; }
    })();
  };
  element.addEventListener('dblclick', handle, true);
  return () => { disposed = true; element.removeEventListener('dblclick', handle, true); };
}
