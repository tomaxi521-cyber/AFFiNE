import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

import { AuthenticationRequired, EventBus } from '../../base';
import { createDocWithMarkdown } from '../../native';
import { PgWorkspaceDocStorageAdapter } from '../doc';
import { PermissionAccess } from '../permission';
import {
  createMainBoardRootUpdate,
  type MainBoardBundle,
  MAIN_BOARD_TITLE,
} from './main-board-seed';

@Injectable()
export class MainBoardService {
  constructor(
    private readonly db: PrismaClient,
    private readonly ac: PermissionAccess,
    private readonly storage: PgWorkspaceDocStorageAdapter,
    private readonly event: EventBus
  ) {}

  async bootstrap(workspaceId: string, userId: string): Promise<MainBoardBundle> {
    if (!userId) throw new AuthenticationRequired();
    const access = this.ac.user(userId);
    await access.workspace(workspaceId).assert('Workspace.Read');
    await access.workspace(workspaceId).assert('Workspace.CreateDoc');
    await access.doc(workspaceId, workspaceId).assert('Doc.Read');
    // Same root write check as the native sync gateway (no allowLocal bypass).
    await access.doc(workspaceId, workspaceId).assert('Doc.Update');

    const row = await this.db.$transaction(
      async tx => {
        // Lock the existing workspace to serialize even the absent-row case
        // across processes. The new table PK is a second uniqueness barrier.
        const locked = await tx.$queryRaw<Array<{ id: string }>>
          `SELECT id FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`;
        if (!locked.length) throw new NotFoundException('Workspace not found');
        const existing = await tx.workspaceMainBoard.findUnique({
          where: { workspaceId },
        });
        if (existing) return existing;

        // Non-compacting read avoids snapshot/event writes while holding the
        // workspace row lock (and does not touch any content documents).
        const root = await this.storage.getDocBinNative(
          workspaceId,
          workspaceId
        );
        if (!root) {
          throw new ConflictException('Workspace root is not ready');
        }
        const docId = nanoid();
        await access.doc(workspaceId, docId).assert('Doc.Read');
        await access.doc(workspaceId, docId).assert('Doc.Update');
        const rootUpdate = createMainBoardRootUpdate(root, workspaceId, docId);
        // Same native AFFiNE page/surface writer as DocWriter, with no user body.
        // Never call DocWriter.createDoc (which would append metadata again).
        const contentUpdate = createDocWithMarkdown(MAIN_BOARD_TITLE, '', docId);
        // Match the adapter's limit: do not persist an unpushable seed.
        if (
          [rootUpdate, contentUpdate].some(
            update => update.length > 32 * 1024 * 1024
          )
        ) {
          throw new ConflictException(
            'Main board bootstrap exceeds the document update limit'
          );
        }
        return tx.workspaceMainBoard.create({
          data: { workspaceId, docId, version: 1, rootUpdate, contentUpdate },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    // Validate the persisted ID on every request, including the existing path.
    // Possession of a workspace ID or bundle is not authorization.
    await access.doc(workspaceId, row.docId).assert('Doc.Read');
    await access.doc(workspaceId, row.docId).assert('Doc.Update');
    if (row.version !== 1) {
      throw new ConflictException('Unsupported main board bootstrap version');
    }
    // COMMITTED before either push. Not cross-document atomic: after failure
    // retry replays identical bytes. Content first avoids advertising an empty
    // main board to other clients. Never delete/regenerate this row or ID.
    for (const [docId, update] of [
      [row.docId, row.contentUpdate],
      [workspaceId, row.rootUpdate],
    ] as const) {
      const updates = [Buffer.from(update)];
      const timestamp = await this.storage.pushDocUpdates(
        workspaceId,
        docId,
        updates,
        userId
      );
      if (!timestamp) {
        throw new ServiceUnavailableException(
          'Main board update was not accepted'
        );
      }
      this.event.emit('doc.updates.pushed', {
        spaceType: 'workspace',
        spaceId: workspaceId,
        docId,
        updates,
        timestamp,
        editor: userId,
      });
    }
    return {
      version: 1,
      docId: row.docId,
      rootUpdate: Buffer.from(row.rootUpdate).toString('base64'),
      contentUpdate: Buffer.from(row.contentUpdate).toString('base64'),
    };
  }
}
