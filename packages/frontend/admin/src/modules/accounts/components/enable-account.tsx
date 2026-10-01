import { ConfirmDialog } from '../../../components/shared/confirm-dialog';

export const EnableAccountDialog = ({
  open,
  email,
  onClose,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="启用账号"
      description={
        <>
          确定要启用此账号吗？启用后，可使用 <span className="font-bold">{email}</span> 邮箱登录。
        </>
      }
      confirmText="启用"
      confirmButtonVariant="default"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};
