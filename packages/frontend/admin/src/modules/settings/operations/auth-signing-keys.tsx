import { Badge } from '@affine/admin/components/ui/badge';
import { Button } from '@affine/admin/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@affine/admin/components/ui/card';
import { useMutation } from '@affine/admin/use-mutation';
import { useQuery } from '@affine/admin/use-query';
import { notify } from '@affine/component';
import type { UserFriendlyError } from '@affine/error';
import {
  authSigningKeysQuery,
  deleteAuthSigningKeyMutation,
  rotateAuthSigningKeyMutation,
} from '@affine/graphql';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '../../../components/shared/confirm-dialog';

type PendingAction =
  | { type: 'rotate'; keyId: string }
  | { type: 'delete'; keyId: string };

export function AuthSigningKeys() {
  const { data, mutate } = useQuery({ query: authSigningKeysQuery });
  const { trigger: rotate, isMutating: rotating } = useMutation({
    mutation: rotateAuthSigningKeyMutation,
  });
  const { trigger: remove, isMutating: deleting } = useMutation({
    mutation: deleteAuthSigningKeyMutation,
  });
  const [pending, setPending] = useState<PendingAction>();
  const keys = useMemo(
    () =>
      [...data.authSigningKeys].sort((left, right) =>
        left.status === right.status ? 0 : left.status === 'active' ? -1 : 1
      ),
    [data.authSigningKeys]
  );
  const active = keys.find(key => key.status === 'active');
  const mutating = rotating || deleting;

  const confirm = async () => {
    if (!pending) return;
    try {
      if (pending.type === 'rotate') {
        await rotate({ expectedActiveKeyId: pending.keyId });
        notify.success({
          title: '签名密钥已轮换',
          message: '新的访问令牌现在使用替换后的密钥。',
        });
      } else {
        await remove({ id: pending.keyId });
        notify.success({
          title: '签名密钥已删除',
          message: '已移除过期的签名密钥。',
        });
      }
      setPending(undefined);
      await mutate();
    } catch (error) {
      const friendly = error as UserFriendlyError;
      notify.error({
        title: '签名密钥更新失败',
        message: friendly.message,
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-sm">访问令牌签名密钥</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            服务器已自动生成并存储签名密钥。
            可在需要时于此处轮换；管理面板不会显示密钥内容。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!active || mutating}
          onClick={() => {
            if (active) setPending({ type: 'rotate', keyId: active.id });
          }}
        >
          轮换密钥
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {keys.length === 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            没有可用的活动签名密钥。请重启服务器以重试自动初始化。
          </div>
        ) : (
          keys.map(key => {
            return (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate text-xs">{key.id}</code>
                    <Badge
                      variant={
                        key.status === 'active' ? 'default' : 'secondary'
                      }
                    >
                      {key.status === 'active' ? '使用中' : '退役中'}
                    </Badge>
                    {key.source === 'auto' ? (
                      <Badge variant="outline">自动生成</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    创建于 {formatDate(key.createdAt)}
                    {key.verifyUntil
                      ? ` · 可验证至 ${formatDate(key.verifyUntil)}`
                      : ''}
                    {key.retiredAt
                      ? ` · 退役于 ${formatDate(key.retiredAt)}`
                      : ''}
                  </div>
                </div>
                {key.status === 'retiring' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!key.canDelete || mutating}
                    title={
                      key.canDelete
                        ? '删除过期密钥'
                        : '此密钥的验证有效期结束后即可删除。'
                    }
                    onClick={() =>
                      setPending({ type: 'delete', keyId: key.id })
                    }
                  >
                    删除
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={open => {
          if (!open && !mutating) setPending(undefined);
        }}
        title={
          pending?.type === 'delete'
            ? '删除签名密钥？'
            : '轮换签名密钥？'
        }
        description={
          pending?.type === 'delete'
            ? '过期密钥将被永久移除。'
            : '新密钥将立即生效。当前密钥仅在验证已签发访问令牌所需的期限内保留。'
        }
        confirmText={pending?.type === 'delete' ? '删除密钥' : '轮换密钥'}
        confirmButtonVariant={
          pending?.type === 'delete' ? 'destructive' : 'default'
        }
        onConfirm={() => {
          confirm().catch(console.error);
        }}
      />
    </Card>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '未知';
}
