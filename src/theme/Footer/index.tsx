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
          href="https://github.com/Keep-it-Simple-Storage"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialIcon}
          aria-label="GitHub"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
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
        {label: 'White-Label Quickstart', to: '/docs/guides/white-label/quickstart'},
        {label: 'PMS Quickstart', to: '/docs/guides/pms/quickstart'},
        {label: 'Authentication', to: '/docs/guides/authentication'},
        {label: 'Concepts', to: '/docs/guides/concepts'},
        {label: 'Error Handling', to: '/docs/guides/error-handling'},
      ],
    },
    {
      title: 'API Reference',
      links: [
        {label: 'Overview', to: '/docs/api-reference/kiss-api'},
        {label: 'Authentication', to: '/docs/api-reference/request-otp'},
        {label: 'Tenant Access', to: '/docs/api-reference/get-tenant-access'},
        {label: 'PMS Sync', to: '/docs/api-reference/sync-units'},
        {label: 'Health Check', to: '/docs/api-reference/health-check'},
      ],
    },
    {
      title: 'Resources',
      links: [
        {label: 'KISS Website', href: 'https://keepitsimplestorage.com'},
        {label: 'GitHub', href: 'https://github.com/Keep-it-Simple-Storage'},
        {label: 'Status', to: '/docs/api-reference/health-check'},
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
              API Base URL: <code>api.keepitsimplestorage.com/api/v1</code>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
