import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

function FooterLogo() {
  const logoLight = useBaseUrl('img/logo.svg');
  const logoDark = useBaseUrl('img/logo-dark.svg');
  return (
    <div className={styles.brand}>
      <Link to="/" className={styles.logoLink}>
        <img src={logoLight} alt="KISS" className={`${styles.logo} ${styles.logoLight}`} />
        <img src={logoDark} alt="KISS" className={`${styles.logo} ${styles.logoDark}`} />
      </Link>
      <p className={styles.brandTagline}>
        Smart storage access,<br />simplified.
      </p>
      <div className={styles.socialLinks}>
        <a
          href="https://keepitsimplestorage.com"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialIcon}
          aria-label="Website"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function FooterLinks() {
  const columns = [
    {
      title: 'Guides',
      links: [
        {label: 'Introduction', to: '/'},
        {label: 'How access works', to: '/guides/concepts'},
        {label: 'Authentication', to: '/guides/authentication'},
      ],
    },
    {
      title: 'Integrate',
      links: [
        {label: 'Sync partners', to: '/guides/pms/quickstart'},
        {label: 'App partners', to: '/guides/white-label/quickstart'},
        {label: 'Error handling', to: '/guides/error-handling'},
        {label: 'API Reference', to: '/reference/kiss-api-reference'},
      ],
    },
  ];

  return (
    <div className={styles.links}>
      {columns.map((column) => (
        <div key={column.title} className={styles.linkColumn}>
          <h4 className={styles.columnTitle}>{column.title}</h4>
          <ul className={styles.linkList}>
            {column.links.map((link) => (
              <li key={link.label}>
                {'to' in link && link.to ? (
                  <Link to={link.to} className={styles.footerLink}>
                    {link.label}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.footerLink}
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function Footer(): ReactNode {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <FooterLogo />
        <FooterLinks />
      </div>
      <div className={styles.bottom}>
        <div className="container">
          <div className={styles.bottomInner}>
            <span className={styles.copyright}>
              &copy; {new Date().getFullYear()} Keep It Simple Storage. All rights reserved.
            </span>
            <span className={styles.baseUrl}>
              API Base URL: <code>https://api-app.keepitsimplestorage.com/api/v2</code>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
