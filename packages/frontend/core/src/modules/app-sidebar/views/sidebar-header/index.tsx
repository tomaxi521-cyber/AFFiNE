import { useLiveData, useService } from '@toeverything/infra';

import { AppSidebarService } from '../../services/app-sidebar';
import { navHeaderStyle } from '../index.css';
import { SidebarSwitch } from './sidebar-switch';

export const SidebarHeader = ({ children }: { children?: React.ReactNode }) => {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const open = useLiveData(appSidebarService.open$);

  return (
    <div className={navHeaderStyle} data-open={open}>
      {children}
      <SidebarSwitch show={open} />
    </div>
  );
};

export * from './sidebar-switch';
