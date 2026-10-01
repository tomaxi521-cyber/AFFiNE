import { LiveData } from '@toeverything/infra';

/** Local navigation only. No document, editor, iframe or permission state lives here. */
export interface ProjectTab {
  flavour: string;
  workspaceId: string;
  rootId: string;
  currentDocId: string;
  title: string;
}

export const PROJECT_TABS_STORAGE_KEY = 'dikw:project-tabs:v1';
export const projectKey = (
  tab: Pick<ProjectTab, 'flavour' | 'workspaceId' | 'rootId'>
) => JSON.stringify([tab.flavour, tab.workspaceId, tab.rootId]);

export function parseProjectTabs(raw: string | null): ProjectTab[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    const result = new Map<string, ProjectTab>();
    for (const item of value.slice(0, 200)) {
      if (
        !item ||
        typeof item !== 'object' ||
        !['flavour', 'workspaceId', 'rootId', 'currentDocId'].every(
          key =>
            typeof item[key] === 'string' &&
            item[key].length > 0 &&
            item[key].length <= 2048
        ) ||
        typeof item.title !== 'string'
      )
        continue;
      const tab: ProjectTab = {
        flavour: item.flavour,
        workspaceId: item.workspaceId,
        rootId: item.rootId,
        currentDocId: item.currentDocId,
        title: item.title.slice(0, 512),
      };
      result.set(projectKey(tab), tab);
    }
    return [...result.values()];
  } catch {
    return [];
  }
}

/** Prefer the right neighbour, then the left; closing does not delete a document. */
export function nearestProjectTab(tabs: readonly ProjectTab[], key: string) {
  const index = tabs.findIndex(tab => projectKey(tab) === key);
  return index < 0 ? undefined : (tabs[index + 1] ?? tabs[index - 1]);
}

export function projectDocId(pathname: string): string | undefined {
  const match = /^[/]([^/]+)[/]?$/.exec(pathname);
  if (!match) return;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return;
  }
}

type NavigationStorage = Pick<Storage, 'getItem' | 'setItem'>;
function browserStorage(): NavigationStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return;
  }
}

export class ProjectTabsStore {
  readonly tabs$: LiveData<readonly ProjectTab[]>;
  private ignoredRouteKey: string | undefined;

  constructor(private readonly storage = browserStorage()) {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(PROJECT_TABS_STORAGE_KEY) ?? null;
    } catch {
      /* private mode */
    }
    this.tabs$ = new LiveData<readonly ProjectTab[]>(parseProjectTabs(raw));
  }

  subscribe = (listener: () => void) => {
    const subscription = this.tabs$.subscribe(listener);
    return () => subscription.unsubscribe();
  };

  private save(tabs: readonly ProjectTab[]) {
    this.tabs$.setValue(tabs);
    try {
      this.storage?.setItem(PROJECT_TABS_STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      /* Navigation remains usable when local storage is full or disabled. */
    }
  }

  record(tab: ProjectTab) {
    const safe = parseProjectTabs(JSON.stringify([tab]))[0];
    if (!safe) return;
    const tabs = this.tabs$.value;
    const index = tabs.findIndex(item => projectKey(item) === projectKey(safe));
    if (index < 0) this.save([...tabs, safe]);
    else if (JSON.stringify(tabs[index]) !== JSON.stringify(safe)) {
      this.save(tabs.map((item, i) => (i === index ? safe : item)));
    }
  }

  /** Keep closed active routes suppressed through async navigation and remounts. */
  observeRoute(routeKey: string): boolean {
    if (this.ignoredRouteKey === routeKey) return false;
    this.ignoredRouteKey = undefined;
    return true;
  }

  close(key: string, activeRouteKey?: string) {
    if (activeRouteKey !== undefined) this.ignoredRouteKey = activeRouteKey;
    this.save(this.tabs$.value.filter(tab => projectKey(tab) !== key));
  }
}

// Intentionally module-global, not registered in a workspace service scope.
export const projectTabsStore = new ProjectTabsStore();
export const projectTabs$ = projectTabsStore.tabs$;
export const recordProjectTab = (tab: ProjectTab) =>
  projectTabsStore.record(tab);
