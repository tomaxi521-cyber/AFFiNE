import { FolderBlockModel } from '@blocksuite/affine-model';
import { createIdentifier } from '@blocksuite/global/di';
import { type BlockStdScope, LifeCycleWatcher } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import type { Subscription } from 'rxjs';

/** Trusted app callbacks only; never source these from block props or files. */
export interface FolderPermissions {
  canWrite(std: BlockStdScope): boolean;
  isCurrentDoc(std: BlockStdScope): boolean;
}
export const FolderPermissionsProvider = createIdentifier<FolderPermissions>(
  'AffineFolderPermissions'
);
export function FolderPermissionExtension(
  permissions: FolderPermissions
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(FolderPermissionsProvider, permissions);
    },
  };
}

/** Fail closed until the host supplies its native GuardService integration. */
export function canWriteFolder(
  std: BlockStdScope,
  folder?: FolderBlockModel
): boolean {
  const permissions = std.getOptional(FolderPermissionsProvider);
  try {
    return (
      !std.store.readonly &&
      !!permissions?.canWrite(std) &&
      permissions.isCurrentDoc(std) &&
      (!folder ||
        (folder.store === std.store &&
          std.store.getBlock(folder.id)?.model === folder &&
          folder.parent?.flavour === 'affine:surface' &&
          !folder.isLocked()))
    );
  } catch {
    return false;
  }
}

const liveGuards = new WeakMap<FolderBlockModel, Set<() => boolean>>();

/** Binds even offscreen folders. Multiple editors may share the same model. */
export class FolderPermissionWatcher extends LifeCycleWatcher {
  static override key = 'affine-folder-permissions';
  private subscription?: Subscription;
  private bindings = new Map<FolderBlockModel, () => boolean>();
  override mounted() {
    const bind = (model: unknown) => {
      if (!(model instanceof FolderBlockModel) || this.bindings.has(model))
        return;
      const guard = () =>
        this.std.host.isConnected && canWriteFolder(this.std, model);
      const guards = liveGuards.get(model) ?? new Set<() => boolean>();
      guards.add(guard);
      liveGuards.set(model, guards);
      this.bindings.set(model, guard);
      model.canDelete = () => [...guards].some(check => check());
    };
    this.std.store
      .getBlocksByFlavour('affine:folder')
      .forEach(block => bind(block.model));
    this.subscription = this.std.store.slots.blockUpdated.subscribe(event => {
      if (event.type === 'add') bind(event.model);
    });
  }
  override unmounted() {
    this.subscription?.unsubscribe();
    this.bindings.forEach((guard, model) =>
      liveGuards.get(model)?.delete(guard)
    );
    this.bindings.clear();
  }
}
