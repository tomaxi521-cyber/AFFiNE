import { Button } from '@affine/admin/components/ui/button';
import { useMutation } from '@affine/admin/use-mutation';
import { notify } from '@affine/component';
import type { UserFriendlyError } from '@affine/error';
import { sendTestEmailMutation } from '@affine/graphql';
import { useCallback } from 'react';

import type { AppConfig } from '../config';

export function SendTestEmail({ appConfig }: { appConfig: AppConfig }) {
  const { trigger } = useMutation({
    mutation: sendTestEmailMutation,
  });

  const onClick = useCallback(() => {
    trigger(appConfig.mailer.SMTP)
      .then(() => {
        notify.success({
          title: '测试邮件已发送',
          message: '测试邮件已成功发送。',
        });
      })
      .catch((err: UserFriendlyError) => {
        notify.error({
          title: '测试邮件发送失败',
          message: err.message,
        });
      });
  }, [appConfig, trigger]);

  return <Button onClick={onClick}>发送测试邮件</Button>;
}
