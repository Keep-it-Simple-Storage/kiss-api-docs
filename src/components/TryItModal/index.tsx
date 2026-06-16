import {useEffect, type ReactNode} from 'react';
import styles from './styles.module.css';

// A lightweight modal rendered inline (no portal) so it stays inside the
// OpenAPI page's Redux Provider + DocProvider — the interactive Request form
// inside it shares the same store, so "Send" still updates the response shown
// on the page. `position: fixed` covers the viewport regardless of DOM depth.
export default function TryItModal({
  title,
  onClose,
  children,
}: {
  title?: string;
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

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Try it'}
        onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{title || 'Try it'}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
