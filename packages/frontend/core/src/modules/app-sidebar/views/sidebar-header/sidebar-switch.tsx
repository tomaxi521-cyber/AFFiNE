import { IconButton } from '@affine/component';
import { NotificationCountService } from '@affine/core/modules/notification';
import { track } from '@affine/track';
import { SidebarIcon } from '@affine/core/components/root-app-sidebar/sidebar-icon';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { AppSidebarService } from '../../services/app-sidebar';
import * as styles from './sidebar-switch.css';

export const SidebarSwitch = ({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) => {
  const notificationCountService = useService(NotificationCountService);
  const hasNotification = useLiveData(
    notificationCountService.count$.selector(count => count > 0)
  );

  const appSidebarService = useService(AppSidebarService).sidebar;
  const open = useLiveData(appSidebarService.open$);
  const handleClickSwitch = useCallback(() => {
    track.$.navigationPanel.$.toggle({
      type: open ? 'collapse' : 'expand',
    });
    appSidebarService.setHovering(false);
    appSidebarService.toggleSidebar();
  }, [appSidebarService, open]);

  const showNotificationDot = hasNotification && !open;

  return (
    <div
      data-show={show}
      className={styles.sidebarSwitchClip}
      data-testid={`app-sidebar-arrow-button-${open ? 'collapse' : 'expand'}`}
      data-notification={showNotificationDot}
    >
      <IconButton
        className={className}
        size="24"
        style={{
          zIndex: 1,
          width: '100%',
          minHeight: 'inherit',
        }}
        onClick={handleClickSwitch}
        aria-label={open ? '收起侧栏' : '展开侧栏'}
      >
        <SidebarIcon name="sidebar" />
      </IconButton>
    </div>
  );
};
