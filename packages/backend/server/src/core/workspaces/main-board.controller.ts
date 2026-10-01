import { Controller, Header, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth';
import { MainBoardService } from './main-board';

// AuthGuard is global; this controller intentionally has no @Public decorator.
@Controller('/api/workspaces')
export class MainBoardController {
  constructor(private readonly mainBoard: MainBoardService) {}

  // Actual route: POST /api/workspaces/:workspaceId/dikw/main-board
  // (prefixed by server.path only when AFFINE_SERVER_SUB_PATH is configured).
  @Post('/:workspaceId/dikw/main-board')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async bootstrap(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUser
  ) {
    return this.mainBoard.bootstrap(workspaceId, user.id);
  }
}
