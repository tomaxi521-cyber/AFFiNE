import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import {
  adminUpdateWorkspaceMutation,
  adminWorkspaceQuery,
  adminWorkspacesQuery,
} from '@affine/graphql';
import { AccountIcon } from '@blocksuite/icons/rc';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useMutateQueryResource, useMutation } from '../../../use-mutation';
import { useQuery } from '../../../use-query';
import { RightPanelHeader } from '../../header';
import { useRightPanel } from '../../panel/context';
import type { WorkspaceDetail } from '../schema';
import { formatBytes } from '../utils';

export function WorkspacePanel({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const { data } = useQuery({
    query: adminWorkspaceQuery,
    variables: {
      id: workspaceId,
      memberSkip: 0,
      memberTake: 20,
    },
  });
  const workspace = data.adminWorkspace;

  if (!workspace) {
    return (
      <div className="flex flex-col h-full">
        <RightPanelHeader
          title="工作区"
          handleClose={onClose}
          handleConfirm={onClose}
          canSave={false}
        />
        <div className="p-6 text-sm text-muted-foreground">
          未找到工作区。
        </div>
      </div>
    );
  }

  return <WorkspacePanelContent workspace={workspace} onClose={onClose} />;
}

function WorkspacePanelContent({
  workspace,
  onClose,
}: {
  workspace: WorkspaceDetail;
  onClose: () => void;
}) {
  const { setHasDirtyChanges } = useRightPanel();
  const revalidate = useMutateQueryResource();
  const { trigger: updateWorkspace, isMutating } = useMutation({
    mutation: adminUpdateWorkspaceMutation,
  });

  const normalizedWorkspace = useMemo(
    () => ({
      flags: {
        public: workspace.public,
        enableAi: workspace.enableAi,
        enableSharing: workspace.enableSharing,
        enableUrlPreview: workspace.enableUrlPreview,
        enableDocEmbedding: workspace.enableDocEmbedding,
        name: workspace.name ?? '',
      },
    }),
    [workspace]
  );

  const [flags, setFlags] = useState(normalizedWorkspace.flags);
  const [baseline, setBaseline] = useState(normalizedWorkspace);

  useEffect(() => {
    setFlags(normalizedWorkspace.flags);
    setBaseline(normalizedWorkspace);
  }, [normalizedWorkspace]);

  const hasChanges = useMemo(() => {
    return (
      flags.public !== baseline.flags.public ||
      flags.enableAi !== baseline.flags.enableAi ||
      flags.enableSharing !== baseline.flags.enableSharing ||
      flags.enableUrlPreview !== baseline.flags.enableUrlPreview ||
      flags.enableDocEmbedding !== baseline.flags.enableDocEmbedding ||
      flags.name !== baseline.flags.name
    );
  }, [baseline, flags]);

  useEffect(() => {
    setHasDirtyChanges(hasChanges);
  }, [hasChanges, setHasDirtyChanges]);

  const handleSave = useCallback(() => {
    const update = async () => {
      try {
        await updateWorkspace({
          input: {
            id: workspace.id,
            public: flags.public,
            enableAi: flags.enableAi,
            enableSharing: flags.enableSharing,
            enableUrlPreview: flags.enableUrlPreview,
            enableDocEmbedding: flags.enableDocEmbedding,
            name: flags.name || null,
          },
        });
        await Promise.all([
          revalidate(adminWorkspacesQuery),
          revalidate(adminWorkspaceQuery, vars => vars?.id === workspace.id),
        ]);
        toast.success('工作区更新成功');
        setBaseline({
          flags: { ...flags },
        });
        setHasDirtyChanges(false);
        onClose();
      } catch (e) {
        toast.error(`更新工作区失败：${(e as Error).message}`);
      }
    };
    update().catch(() => {});
  }, [
    flags,
    onClose,
    revalidate,
    setBaseline,
    setHasDirtyChanges,
    updateWorkspace,
    workspace.id,
  ]);

  const memberList = workspace.members ?? [];

  return (
    <div className="flex h-full flex-col bg-background">
      <RightPanelHeader
        title="更新工作区"
        handleClose={onClose}
        handleConfirm={handleSave}
        canSave={hasChanges && !isMutating}
      />
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="text-xs text-muted-foreground">工作区 ID</div>
          <div className="text-sm font-mono break-all">{workspace.id}</div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">名称</Label>
            <Input
              value={flags.name}
              onChange={e =>
                setFlags(prev => ({ ...prev, name: e.target.value }))
              }
              placeholder="工作区名称"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-sm">
          <FlagItem
            label="公开"
            description="允许公开访问工作区页面"
            checked={flags.public}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, public: value }))
            }
          />
          <Separator />
          <FlagItem
            label="启用 AI"
            description="允许在此工作区中使用 AI 功能"
            checked={flags.enableAi}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableAi: value }))
            }
          />
          <Separator />
          <FlagItem
            label="启用 URL 预览"
            description="允许在共享页面中预览 URL"
            checked={flags.enableUrlPreview}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableUrlPreview: value }))
            }
          />
          <Separator />
          <FlagItem
            label="允许工作区共享"
            description="允许公开共享此工作区中的页面"
            checked={flags.enableSharing}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableSharing: value }))
            }
          />
          <Separator />
          <FlagItem
            label="启用文档向量化"
            description="允许将文档向量化以用于搜索"
            checked={flags.enableDocEmbedding}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableDocEmbedding: value }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="快照大小"
            value={formatBytes(workspace.snapshotSize)}
          />
          <MetricCard
            label="快照数量"
            value={`${workspace.snapshotCount}`}
          />
          <MetricCard
            label="二进制对象大小"
            value={formatBytes(workspace.blobSize)}
          />
          <MetricCard label="二进制对象数量" value={`${workspace.blobCount}`} />
          <MetricCard
            label="活跃成员"
            value={`${workspace.memberCount}`}
          />
          <MetricCard
            label="共享页面"
            value={`${workspace.publicPageCount}`}
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="px-3 py-2 text-sm font-medium">
            成员与邀请
          </div>
          <Separator />
          <div className="flex flex-col divide-y">
            {memberList.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                暂无成员或邀请。
              </div>
            ) : (
              memberList.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={member.avatarUrl ?? undefined} />
                    <AvatarFallback>
                      <AccountIcon fontSize={16} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col overflow-hidden">
                    <div className="text-sm font-medium truncate">
                      {member.name || member.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-1 text-xs">
                    <div className="rounded border px-2 py-1">
                      {member.role}
                    </div>
                    {member.status !== 'Accepted' ? (
                      <div className="text-muted-foreground">
                        {member.status}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagItem({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 p-3">
      <div className="flex flex-col">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
