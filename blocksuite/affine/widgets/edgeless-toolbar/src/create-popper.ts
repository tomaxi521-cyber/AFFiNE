import { BlockSuiteError } from '@blocksuite/global/exceptions';
import { autoUpdate } from '@floating-ui/dom';

// more than 100% due to the shadow
const leaveToPercent = `calc(100% + 10px)`;

export interface MenuPopper<T extends HTMLElement> {
  element: T;
  dispose: () => void;
  cancel?: () => void;
}

// store active poppers
const popMap = new WeakMap<HTMLElement, Map<string, MenuPopper<HTMLElement>>>();

function animateEnter(el: HTMLElement) {
  el.style.transform = 'translateY(0)';
}
function animateLeave(el: HTMLElement) {
  el.style.transform = `translateY(${leaveToPercent})`;
}

export function createPopper<T extends keyof HTMLElementTagNameMap>(
  tagName: T,
  reference: HTMLElement,
  options?: {
    /** transition duration in ms */
    duration?: number;
    onDispose?: () => void;
    setProps?: (ele: HTMLElementTagNameMap[T]) => void;
  }
): MenuPopper<HTMLElementTagNameMap[T]> {
  const duration = options?.duration ?? 230;

  if (!popMap.has(reference)) popMap.set(reference, new Map());
  const elMap = popMap.get(reference);
  // if there is already a popper, cancel leave transition and apply enter transition
  if (elMap && elMap.has(tagName)) {
    const popper = elMap.get(tagName);
    if (popper) {
      popper.cancel?.();
      requestAnimationFrame(() => animateEnter(popper.element));
      return popper as MenuPopper<HTMLElementTagNameMap[T]>;
    }
  }

  const clipWrapper = document.createElement('div');
  const menu = document.createElement(tagName);
  options?.setProps?.(menu);
  clipWrapper.append(menu);
  if (!reference.shadowRoot) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.ValueNotExists,
      'reference must be a shadow root'
    );
  }
  const root = reference.getRootNode();
  const toolbar = root instanceof ShadowRoot &&
    root.host.matches('edgeless-toolbar-widget[data-dikw-board]')
    ? root.host as HTMLElement
    : null;
  // DIKW tools live in a side panel. Their native option menus must not be
  // clipped by that panel or positioned above a nonexistent bottom dock.
  (toolbar?.shadowRoot ?? reference.shadowRoot).append(clipWrapper);

  // apply enter transition
  menu.style.transition = `all ${duration}ms ease`;
  animateLeave(menu);
  requestAnimationFrame(() => animateEnter(menu));

  Object.assign(clipWrapper.style, {
    height: '100px',
    pointerEvents: 'none',
    position: 'absolute',
    overflow: 'hidden',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    left: '0px',
    bottom: '100%',
    display: 'flex',
    alignItems: 'end',
  });

  Object.assign(menu.style, {
    width: '100%',
    marginLeft: '30px',
    maxWidth: 'calc(100% - 60px)',
    bottom: '0%',
    pointerEvents: 'auto',
  });
  let stopPositioning: (() => void) | undefined;
  let removed = false;
  if (toolbar) {
    Object.assign(clipWrapper.style, {
      position: 'absolute',
      height: 'auto',
      width: `${Math.max(160, Math.min(680, toolbar.clientWidth - 104))}px`,
      maxWidth: 'calc(100vw - 24px)',
      bottom: 'auto',
      overflow: 'visible',
      zIndex: '4',
    });
    Object.assign(menu.style, {
      position: 'relative',
      marginLeft: '0',
      maxWidth: '100%',
      zIndex: 'auto',
    });
    // Position in local chrome coordinates: editor containment makes fixed
    // viewport coordinates unreliable here. Reuse native menus without a dock.
    Object.assign(menu.style, { transition: 'none', flex: '0 0 100%', minWidth: '0', boxSizing: 'border-box' });
    clipWrapper.style.overflowX = 'auto';
    const updatePosition = () => {
      if (removed) return;
      const hostRect = toolbar.getBoundingClientRect();
      const anchor = reference.getBoundingClientRect();
      const right = Math.min(window.innerWidth, hostRect.right);
      const bottom = Math.min(window.innerHeight, hostRect.bottom);
      const width = Math.max(160, Math.min(680, right - hostRect.left - 24));
      clipWrapper.style.width = width + 'px';
      clipWrapper.style.maxHeight = Math.max(44,bottom-hostRect.top-24)+'px';
      clipWrapper.style.overflowY = 'auto';
      const height = Math.max(80, clipWrapper.offsetHeight);
      const x = Math.max(hostRect.left + 12, Math.min(anchor.left + anchor.width/2 - width/2, right - width - 12));
      let y = anchor.top - height - 12;
      y = Math.max(hostRect.top + 12, Math.min(y, bottom - height - 12));
      Object.assign(clipWrapper.style, { left: (x-hostRect.left)+'px', top: (y-hostRect.top)+'px' });
    };
    stopPositioning = autoUpdate(reference, clipWrapper, updatePosition);
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'dblclick', 'click', 'wheel']) {
      clipWrapper.addEventListener(type, event => event.stopPropagation());
    }
  }
  const remove = () => {
    removed = true;
    stopPositioning?.();
    clipWrapper.remove();
    menu.remove();
    popMap.get(reference)?.delete(tagName);
    options?.onDispose?.();
  };

  const popper: MenuPopper<HTMLElementTagNameMap[T]> = {
    element: menu,
    dispose: () => {
      if (toolbar) {
        remove();
        return;
      }
      // apply leave transition
      animateLeave(menu);
      menu.addEventListener('transitionend', remove, { once: true });
      popper.cancel = () => menu.removeEventListener('transitionend', remove);
    },
  };

  popMap.get(reference)?.set(tagName, popper);
  return popper;
}
