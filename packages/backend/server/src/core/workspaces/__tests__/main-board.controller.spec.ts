import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import test from 'ava';

import type { CurrentUser } from '../../auth';
import type { MainBoardService } from '../main-board';
import { MainBoardController } from '../main-board.controller';

// Route metadata unit test; real AuthGuard/HTTP + PostgreSQL tests are separate.
test('registers POST /api/workspaces/:workspaceId/dikw/main-board with status 200', t => {
  t.is(Reflect.getMetadata(PATH_METADATA, MainBoardController), '/api/workspaces');
  t.is(Reflect.getMetadata(PATH_METADATA, MainBoardController.prototype.bootstrap), '/:workspaceId/dikw/main-board');
  t.is(Reflect.getMetadata(METHOD_METADATA, MainBoardController.prototype.bootstrap), RequestMethod.POST);
  t.is(Reflect.getMetadata(HTTP_CODE_METADATA, MainBoardController.prototype.bootstrap), 200);
});

test('passes the authenticated subject, not request body identity, to bootstrap', async t => {
  const bundle = { version: 1, docId: 'main', rootUpdate: 'AA==', contentUpdate: 'AA==' };
  const calls: string[][] = [];
  const service = {
    bootstrap: async (workspaceId: string, userId: string) => {
      calls.push([workspaceId, userId]);
      return bundle;
    },
  } as unknown as MainBoardService;
  const controller = new MainBoardController(service);
  t.is(await controller.bootstrap('ws', { id: 'authenticated-user' } as CurrentUser), bundle);
  t.deepEqual(calls, [['ws', 'authenticated-user']]);
});
