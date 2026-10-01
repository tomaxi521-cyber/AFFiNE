import { Menu, MenuSeparator, Tooltip } from '@affine/component';
import { MenuItem as SidebarMenuItem } from '@affine/core/modules/app-sidebar/views';
import {
  TemplateListMenuAdd,
  TemplateListMenuContentScrollable,
} from '@affine/core/modules/template-doc/view/template-list-menu';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { TemplateIcon } from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';

import { iconButton } from './footer-tools.css';

export const TemplateDocEntrance = ({ iconOnly = false }: { iconOnly?: boolean }) => {
  const t = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setMenuOpen(prev => !prev);
  }, []);

  const onMenuOpenChange = useCallback((open: boolean) => {
    if (open) track.$.sidebar.template.openTemplateListMenu();
    setMenuOpen(open);
  }, []);

  const menu = (
      <Menu
        rootOptions={{ open: menuOpen, onOpenChange: onMenuOpenChange }}
        contentOptions={{
          side: iconOnly ? 'top' : 'right',
          align: 'end',
          alignOffset: -4,
          sideOffset: 16,
          style: { width: 280 },
        }}
        items={
          <TemplateListMenuContentScrollable
            asLink
            suffixItems={
              <>
                <MenuSeparator />
                <TemplateListMenuAdd />
              </>
            }
          />
        }
      >
        {iconOnly ? <button type="button" className={iconButton} aria-label={t['Template']()}
          data-testid="sidebar-template-doc-entrance">
          <TemplateIcon width={22} height={22} />
        </button> : <span>{t['Template']()}</span>}
      </Menu>
  );
  return iconOnly ? <Tooltip content={t['Template']()}><span style={{ display: 'inline-flex' }}>{menu}</span></Tooltip> : (
    <SidebarMenuItem data-testid="sidebar-template-doc-entrance" icon={<TemplateIcon />} onClick={toggleMenu}>
      {menu}
    </SidebarMenuItem>
  );
};
