-- One immutable bootstrap bundle per workspace. Intentionally no document FK:
-- deleting/trashing a content document must not release its main-board identity.
CREATE TABLE "workspace_main_boards" (
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_update" BYTEA NOT NULL,
    "content_update" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_main_boards_pkey" PRIMARY KEY ("workspace_id")
);

ALTER TABLE "workspace_main_boards" ADD CONSTRAINT "workspace_main_boards_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
