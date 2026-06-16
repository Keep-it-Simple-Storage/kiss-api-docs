import type {ReactNode} from 'react';
import styles from './styles.module.css';

// A small colored HTTP-method pill for use inline in guide tables.
// Colors come from the shared --method-* palette in custom.css.
export default function Method({m}: {m: string}): ReactNode {
  const key = (m || '').toLowerCase();
  return <span className={`${styles.pill} ${styles[key] ?? ''}`}>{(m || '').toUpperCase()}</span>;
}
