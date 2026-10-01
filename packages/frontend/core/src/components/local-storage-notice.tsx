import { useId, useState } from 'react';

import * as styles from './local-storage-notice.css';

export type LocalStorageNoticeProps = {
  isLoggedIn: boolean;
  warning: string;
  actionLabel: string;
  onLogin: () => void;
  onEnableCloud: () => void;
  onClose: () => void;
};

/** Storage location, not an acknowledgement that pending edits have saved. */
export const LocalStorageNotice = ({
  isLoggedIn,
  warning,
  actionLabel,
  onLogin,
  onEnableCloud,
  onClose,
}: LocalStorageNoticeProps) => {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const onSync = isLoggedIn ? onEnableCloud : onLogin;

  return (
    <div className={styles.notice} data-testid="local-demo-tips">
      <div className={styles.row}>
        <span className={styles.status}>仅保存在此浏览器 · 未同步</span>
        <span className={styles.risk}>清理浏览器数据可能丢失</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? '收起详情' : '查看详情'}
          </button>
          <button type="button" className={styles.syncButton} onClick={onSync}>
            {isLoggedIn ? '启用同步' : '登录并启用同步'}
          </button>
          <button
            type="button"
            className={styles.button}
            aria-label="关闭本地存储提示"
            data-testid="local-demo-tips-close-button"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
      <div
        id={detailsId}
        role="region"
        aria-label="本地存储风险详情"
        hidden={!expanded}
        className={styles.details}
      >
        <p className={styles.warning}>{warning}</p>
        <button type="button" className={styles.syncButton} onClick={onSync}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
