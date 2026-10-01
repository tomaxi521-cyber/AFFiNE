import { registerAffineCommand } from '@affine/core/commands';
import { EditorService } from '@affine/core/modules/editor';
import { ViewService, WorkbenchService } from '@affine/core/modules/workbench';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import * as styles from './board-view-switch.css';

const views = [
  { mode: 'edgeless', label: '画布' },
  { mode: 'page', label: '整理视图' },
] as const;

/** A presentation-only switch for registered boards, using native editor state. */
export function BoardViewSwitch() {
  const editor = useService(EditorService).editor;
  const currentMode = useLiveData(editor.mode$);
  const trash = useLiveData(editor.doc.trash$);
  const view = useServiceOptional(ViewService)?.view;
  const workbench = useServiceOptional(WorkbenchService)?.workbench;
  const activeView = useLiveData(workbench?.activeView$);
  const isActiveView = activeView?.id && activeView.id === view?.id;

  const setMode = useCallback(
    (mode: DocMode) => {
      // Match native behavior: changing a view does not grant editing rights.
      // Read current values too, so a queued click cannot switch a trashed doc.
      if (editor.doc.trash$.value || editor.mode$.value === mode) return;
      editor.setMode(mode);
      editor.setSelector(undefined);
      track.$.header.actions.switchPageMode({ mode });
    },
    [editor]
  );

  useEffect(() => {
    if (trash || currentMode === undefined || !isActiveView) return;
    return registerAffineCommand({
      id: 'affine:doc-mode-switch',
      category: 'editor:page',
      label: currentMode === 'page' ? '切换到画布' : '切换到整理视图',
      icon: currentMode === 'page' ? <EdgelessIcon /> : <PageIcon />,
      keyBinding: { binding: 'Alt+KeyS', capture: true },
      run: () =>
        setMode(editor.mode$.value === 'edgeless' ? 'page' : 'edgeless'),
    });
  }, [currentMode, editor, isActiveView, setMode, trash]);

  return (
    <div
      className={styles.switchGroup}
      role="group"
      aria-label="白板视图"
      data-testid="dikw-board-view-switch"
      data-mode={currentMode}
    >
      {views.map(({ mode, label }) =>
        trash && currentMode !== mode ? null : (
          <button
            key={mode}
            type="button"
            className={styles.viewButton}
            aria-pressed={currentMode === mode}
            disabled={trash || currentMode === undefined}
            data-testid={`dikw-board-view-${mode}`}
            onClick={() => setMode(mode)}
          >
            {label}
          </button>
        )
      )}
    </div>
  );
}
