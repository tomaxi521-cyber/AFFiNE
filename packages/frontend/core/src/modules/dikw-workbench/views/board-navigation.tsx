import { useEffect, useId, useRef, useState } from 'react';

import * as styles from './board-navigation.css';

export interface BoardNavigationItem {
  id: string;
  title: string;
}

export interface BoardNavigationProps {
  canvasTools?: boolean;
  /** Logical root-to-current parent chain, never a browser/reference history. */
  path: readonly BoardNavigationItem[];
  /** Direct logical children only; ordinary references belong elsewhere. */
  childrenList: readonly BoardNavigationItem[];
  onNavigate: (id: string) => void;
  /** Resolve on success; reject with a user-facing error on failure. */
  onCreateChild: (title: string) => Promise<unknown>;
  /** Open the host's reference picker. This does not establish parenthood. */
  onReference?: () => void;
  onRetry?: () => void;
  busy?: boolean;
  error?: string | null;
  /** Mutation permissions fail closed until the host explicitly grants them. */
  canCreate?: boolean;
  canReference?: boolean;
  canNavigate?: boolean;
}

const displayTitle = ({ title }: BoardNavigationItem) =>
  title.trim() || '未命名白板';

/** Presentation only: no service lookup, router, persistence, or live editor. */
export const BoardNavigation = (props: BoardNavigationProps) => (
  <BoardNavigationContent
    key={props.path[props.path.length - 1]?.id ?? ''}
    {...props}
  />
);

const BoardNavigationContent = ({
  path,
  childrenList,
  onNavigate,
  onCreateChild,
  onReference,
  onRetry,
  busy = false,
  error,
  canCreate = false,
  canReference = false,
  canNavigate = true,
  canvasTools = false,
}: BoardNavigationProps) => {
  const id = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const mounted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const current = path[path.length - 1];
  const parent = path[path.length - 2];
  const root = path[0];
  const pending = busy || creating;
  const navigationDisabled = pending || !canNavigate;
  const creationDisabled = pending || !canCreate || !current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (formOpen) inputRef.current?.focus();
  }, [formOpen]);

  const closeForm = () => {
    if (pending) return;
    setFormOpen(false);
    setTitle('');
    setCreateError(null);
    createButtonRef.current?.focus();
  };

  const createChild = async () => {
    if (creationDisabled || submitting.current) return;
    const name = title.trim();
    if (!name) {
      setCreateError('请输入子白板名称。');
      inputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setCreating(true);
    setCreateError(null);
    setNotice('');
    try {
      await onCreateChild(name);
      if (!mounted.current) return;
      setTitle('');
      setFormOpen(false);
      setNotice('子白板已创建。');
    } catch (cause) {
      if (!mounted.current) return;
      const message =
        cause instanceof Error
          ? cause.message
          : typeof cause === 'string'
            ? cause
            : '';
      setCreateError(message.trim() || '创建子白板失败，请重试。');
    } finally {
      submitting.current = false;
      if (mounted.current) setCreating(false);
    }
  };

  useEffect(() => {
    if (!creating && notice) createButtonRef.current?.focus();
  }, [creating, notice]);

  return (
    <section className={styles.container} aria-label="白板导航">
      <div className={styles.toolbar}>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.textButton}
            aria-label="返回父白板"
            title="返回父白板"
            disabled={navigationDisabled || !parent}
            onClick={() => parent && onNavigate(parent.id)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className={styles.textButton}
            aria-label="返回主白板"
            title="返回主白板"
            disabled={navigationDisabled || !root || path.length < 2}
            onClick={() => root && onNavigate(root.id)}
          >
            主白板
          </button>
        </div>
        <nav className={styles.path} aria-label="白板层级路径">
          <ol className={styles.breadcrumbs}>
            {path.map((board, index) => (
              <li className={styles.crumb} key={board.id}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {index === path.length - 1 ? (
                  <span
                    className={styles.current}
                    aria-current="page"
                    title={displayTitle(board)}
                  >
                    {displayTitle(board)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.breadcrumbButton}
                    title={displayTitle(board)}
                    disabled={navigationDisabled}
                    onClick={() => onNavigate(board.id)}
                  >
                    {displayTitle(board)}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {!current ? <span className={styles.hint}>尚未选择白板。</span> : null}
        </nav>
        <div className={styles.actions}>
          {!canvasTools && <button
            ref={createButtonRef}
            type="button"
            className={styles.textButton}
            disabled={creationDisabled}
            aria-expanded={formOpen}
            aria-controls={formOpen ? id + '-form' : undefined}
            title={!canCreate ? '当前无新建子白板权限' : undefined}
            onClick={() => {
              setNotice('');
              setFormOpen(true);
            }}
          >
            新建子白板
          </button>}
          {!canvasTools && onReference ? (
            <button
              type="button"
              className={styles.textButton}
              disabled={pending || !canReference || !current}
              title="引用不会改变白板的父子关系"
              onClick={onReference}
            >
              引用已有白板
            </button>
          ) : null}
          <details
            className={styles.recovery}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary className={styles.summary}>
              子白板（{childrenList.length}）
            </summary>
            <section
              className={styles.recoveryPanel}
              aria-label="子白板列表"
              aria-busy={pending}
            >
              <p className={styles.hint}>找不到画布中的子白板？从这里进入。</p>
              {childrenList.length ? (
                <ul className={styles.children}>
                  {childrenList.map((board) => (
                    <li key={board.id}>
                      <button
                        type="button"
                        className={styles.childButton}
                        disabled={navigationDisabled}
                        onClick={() => onNavigate(board.id)}
                      >
                        {displayTitle(board)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !pending && !error && current ? (
                <p className={styles.hint}>暂无子白板。</p>
              ) : null}
            </section>
          </details>
        </div>
      </div>
      {error ? (
        <div role="alert" className={styles.error}>
          <span>白板操作失败：{error}</span>
          {onRetry ? (
            <button
              type="button"
              className={styles.button}
              disabled={pending}
              onClick={onRetry}
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {formOpen ? (
        <form
          id={id + '-form'}
          aria-label="新建子白板"
          className={styles.form}
          aria-busy={creating}
          onSubmit={(event) => {
            event.preventDefault();
            void createChild();
          }}
          onKeyDown={(event) => {
            // Do not let naming shortcuts reach the host editor.
            event.stopPropagation();
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              closeForm();
            }
            if (event.key === 'Enter' && event.nativeEvent.isComposing) {
              event.preventDefault();
            }
          }}
        >
          <label htmlFor={id + '-title'}>子白板名称</label>
          <input
            ref={inputRef}
            id={id + '-title'}
            className={styles.input}
            value={title}
            disabled={creationDisabled}
            autoComplete="off"
            aria-required="true"
            aria-invalid={!!createError}
            aria-describedby={createError ? id + '-error' : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setCreateError(null);
            }}
          />
          {createError ? (
            <p id={id + '-error'} role="alert" className={styles.error}>
              {createError}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.button}
              disabled={creationDisabled}
            >
              {creating ? '正在创建…' : '创建'}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={pending}
              onClick={closeForm}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
      <p role="status" className={styles.status}>
        {creating ? '正在创建子白板…' : busy ? '正在加载白板…' : notice}
      </p>
    </section>
  );
};
