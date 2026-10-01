import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { DocsService } from '../doc';
import { GuardService } from '../permissions';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { BoardRepository } from './board-repository';
import { DikwWorkbenchService } from './service';

export { DikwWorkbenchService, DikwChildCreationError } from './service';
export type { BoardRelation, BoardPath } from './board-graph';

export function configureDikwWorkbenchModule(framework: Framework) {
  framework.scope(WorkspaceScope).service(DikwWorkbenchService, provider => {
    const workspace = provider.get(WorkspaceService);
    return new DikwWorkbenchService(
      provider.get(DocsService),
      workspace,
      provider.get(WorkspaceServerService),
      provider.get(GuardService),
      new BoardRepository(workspace.workspace.rootYDoc)
    );
  });
}
