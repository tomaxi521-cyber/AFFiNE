import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { AccountIcon, LinkIcon } from '@blocksuite/icons/rc';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import type { WorkspaceListItem } from '../schema';
import { formatBytes } from '../utils';
import { DataTableRowActions } from './data-table-row-actions';

export const useColumns = () => {
  const columns: ColumnDef<WorkspaceListItem>[] = useMemo(() => {
    return [
      {
        accessorKey: 'workspace',
        header: () => <div className="text-xs font-medium">工作区</div>,
        cell: ({ row }) => {
          const workspace = row.original;
          return (
            <div className="flex flex-col gap-1 max-w-[40vw] min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium overflow-hidden">
                <span className="truncate">
                  {workspace.name || workspace.id}
                </span>
                {workspace.public ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-chip-white px-2 py-0.5 text-xxs">
                    <LinkIcon fontSize={14} />
                    公开
                  </span>
                ) : null}
              </div>
              <div className="w-full truncate font-mono text-xs text-muted-foreground">
                {workspace.id}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'owner',
        header: () => <div className="text-xs font-medium">所有者</div>,
        cell: ({ row }) => {
          const owner = row.original.owner;
          if (!owner) {
            return <div className="text-xs text-muted-foreground">未知</div>;
          }
          return (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="w-9 h-9">
                <AvatarImage src={owner.avatarUrl ?? undefined} />
                <AvatarFallback>
                  <AccountIcon fontSize={16} />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden min-w-0">
                <div className="text-sm font-medium truncate">{owner.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {owner.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'usage',
        header: () => <div className="text-xs font-medium">用量</div>,
        cell: ({ row }) => {
          const ws = row.original;
          return (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex gap-3">
                <span>快照 {formatBytes(ws.snapshotSize)}</span>
                <span className="text-muted-foreground">
                  ({ws.snapshotCount})
                </span>
              </div>
              <div className="flex gap-3">
                <span>二进制对象 {formatBytes(ws.blobSize)}</span>
                <span className="text-muted-foreground">({ws.blobCount})</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'members',
        header: () => <div className="text-xs font-medium">活跃成员</div>,
        cell: ({ row }) => {
          const ws = row.original;
          return (
            <div className="flex flex-col text-xs gap-1">
              <div className="flex gap-2">
                <span className="font-medium">{ws.memberCount}</span>
                <span className="text-muted-foreground">活跃成员</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">{ws.publicPageCount}</span>
                <span className="text-muted-foreground">共享页面</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'actions',
        meta: {
          className: 'w-[190px] justify-end',
        },
        header: () => (
          <div className="text-xs font-medium text-right">操作</div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-end w-full">
            <DataTableRowActions workspace={row.original} />
          </div>
        ),
      },
    ];
  }, []);

  return columns;
};
