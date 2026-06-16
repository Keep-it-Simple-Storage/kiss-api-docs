import {useEffect, type ReactNode} from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

// A lightweight modal rendered inline (no portal) so it stays inside the
// OpenAPI page's Redux Provider + DocProvider — the interactive Request form
// inside it shares the same store, so "Send" still updates the responses.
// `position: fixed` covers the viewport regardless of DOM depth.
export default function TryItModal({
  item,
  onClose,
  children,
}: {
  item?: {method?: string; path?: string; summary?: string};
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const method = (item?.method ?? '').toLowerCase();
  const path = (item?.path ?? '').replace(/{([a-z0-9-_]+)}/gi, ':$1');

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={item?.summary || 'Try it'}
        onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          {method && (
            <span className={clsx(styles.method, styles[method])}>{method.toUpperCase()}</span>
          )}
          {path && <code className={styles.path}>{path}</code>}
          {item?.summary && <span className={styles.summary}>{item.summary}</span>}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
