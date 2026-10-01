import { Tooltip } from '@affine/component';
import * as footerStyles from './footer-tools.css';
import { ProjectWorkspaces } from './project-workspaces';
import {
  AppSidebar,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
} from '@affine/core/modules/app-sidebar/views';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { CMDKQuickSearchService } from '@affine/core/modules/quicksearch/services/cmdk';
import type { Workspace } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { Store } from '@blocksuite/affine/store';
import { ImportIcon, SettingsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { memo, useCallback } from 'react';

import { WorkbenchService } from '../../modules/workbench';
import { WorkspaceNavigator } from '../workspace-selector';
import {
  bottomContainer,
  quickSearch,
  quickSearchRow,
  workspaceAndUserWrapper,
  workspaceWrapper,
  brandButton,
  brandMark,
} from './index.css';
import { SidebarAudioPlayer } from './sidebar-audio-player';
import { TemplateDocEntrance } from './template-doc-entrance';
import { TrashButton } from './trash-button';
import { UpdaterButton } from './updater-button';
import UserInfo from './user-info';

export type RootAppSidebarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenSettingModal: () => void;
  currentWorkspace: Workspace;
  openPage: (pageId: string) => void;
  createPage: () => Store;
  paths: {
    all: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    shared: (workspaceId: string) => string;
  };
};

const BoardLibraryEntries = () => {
  return (
    <>
      <ProjectWorkspaces />
    </>
  );
};

/**
 * This is for the whole affine app sidebar.
 * This component wraps the app sidebar in `@affine/component` with logic and data.
 *
 */
export const RootAppSidebar = memo((): ReactElement => {
  const { workbenchService, cMDKQuickSearchService } = useServices({
    WorkbenchService,
    CMDKQuickSearchService,
  });

  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workbench = workbenchService.workbench;
  const workspaceSelectorOpen = useLiveData(workbench.workspaceSelectorOpen$);
  const onOpenQuickSearchModal = useCallback(() => {
    cMDKQuickSearchService.toggle();
  }, [cMDKQuickSearchService]);

  const onWorkspaceSelectorOpenChange = useCallback(
    (open: boolean) => {
      workbench.setWorkspaceSelectorOpen(open);
    },
    [workbench]
  );

  const onOpenSettingModal = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'appearance',
    });
    track.$.navigationPanel.$.openSettings();
  }, [workspaceDialogService]);

  const handleOpenDocs = useCallback(
    (result: {
      docIds: string[];
      entryId?: string;
      isWorkspaceFile?: boolean;
    }) => {
      const { docIds, entryId, isWorkspaceFile } = result;
      // If the imported file is a workspace file, open the entry page.
      if (isWorkspaceFile && entryId) {
        workbench.openDoc(entryId);
      } else if (!docIds.length) {
        return;
      }
      // Open all the docs when there are multiple docs imported.
      if (docIds.length > 1) {
        workbench.openAll();
      } else {
        // Otherwise, open the only doc.
        workbench.openDoc(docIds[0]);
      }
    },
    [workbench]
  );

  const onOpenImportModal = useCallback(() => {
    track.$.navigationPanel.importModal.open();
    workspaceDialogService.open('import', undefined, payload => {
      if (!payload) {
        return;
      }
      handleOpenDocs(payload);
    });
  }, [workspaceDialogService, handleOpenDocs]);

  return (
    <AppSidebar
      headerContent={
        <div className={workspaceAndUserWrapper}>
          <div className={workspaceWrapper}>
            <WorkspaceNavigator
              showEnableCloudButton
              showSyncStatus
              open={workspaceSelectorOpen}
              onOpenChange={onWorkspaceSelectorOpenChange}
              dense
              trigger={
                <button
                  type="button"
                  className={brandButton}
                  data-testid="current-workspace-card"
                  aria-label="DIKW Board · 账号与工作区"
                >
                  <span className={brandMark} aria-hidden="true">
                    D
                  </span>
                  <span>DIKW Board</span>
                </button>
              }
            />
          </div>
          <UserInfo />
        </div>
      }
    >
      <SidebarContainer>
        <div className={quickSearchRow}>
          <QuickSearchInput
            className={quickSearch}
            data-testid="slider-bar-quick-search-button"
            data-event-props="$.navigationPanel.$.quickSearch"
            onClick={onOpenQuickSearchModal}
          />
        </div>
      </SidebarContainer>
      <SidebarScrollableContainer>
        <BoardLibraryEntries />
      </SidebarScrollableContainer>
      <SidebarContainer className={bottomContainer}>
        <SidebarAudioPlayer />
        {BUILD_CONFIG.isElectron ? <UpdaterButton /> : null}
        <nav
          aria-label="工作区工具"
          className={footerStyles.tools}
          data-testid="sidebar-footer-tools"
        >
          <TrashButton iconOnly />
          <Tooltip content={t['com.affine.settingSidebar.title']()}>
            <button
              type="button"
              className={footerStyles.iconButton}
              aria-label={t['com.affine.settingSidebar.title']()}
              data-testid="slider-bar-workspace-setting-button"
              onClick={onOpenSettingModal}
            >
              <SettingsIcon width={22} height={22} />
            </button>
          </Tooltip>
          <Tooltip content={t['Import']()}>
            <button
              type="button"
              className={footerStyles.iconButton}
              aria-label={t['Import']()}
              data-testid="slider-bar-import-button"
              onClick={onOpenImportModal}
            >
              <ImportIcon width={22} height={22} />
            </button>
          </Tooltip>
          <TemplateDocEntrance iconOnly />
        </nav>
      </SidebarContainer>
    </AppSidebar>
  );
});

RootAppSidebar.displayName = 'memo(RootAppSidebar)';
