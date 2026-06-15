import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {Icon} from '@site/src/components/icons';
import styles from './styles.module.css';

export function Cards({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 2 | 3;
}): ReactNode {
  return (
    <div className={columns === 3 ? styles.cardGrid3 : styles.cardGrid}>{children}</div>
  );
}

export function Card({
  title,
  href,
  icon,
  children,
}: {
  title: string;
  href?: string;
  icon?: string;
  children?: ReactNode;
}): ReactNode {
  const inner = (
    <>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={22} />
        </span>
      ) : null}
      <span className={styles.title}>{title}</span>
      {children ? <span className={styles.desc}>{children}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link className={styles.card} to={href}>
        {inner}
      </Link>
    );
  }
  return <div className={styles.card}>{inner}</div>;
}
