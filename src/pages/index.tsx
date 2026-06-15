import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function Hero() {
  return (
    <header className={styles.hero}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          KISS API
        </Heading>
        <p className={styles.heroSubtitle}>
          One versioned REST API for smart storage access.
          <br />
          Keep each unit&rsquo;s facts current, and KISS decides who can open which lock, when.
        </p>
        <div className={styles.heroButtons}>
          <Link className={styles.primaryButton} to="/docs">
            Start here
          </Link>
          <Link className={styles.secondaryButton} to="/docs/guides/concepts">
            How access works
          </Link>
        </div>
      </div>
    </header>
  );
}

function BaseUrl() {
  return (
    <section className={styles.baseUrl}>
      <div className="container">
        <div className={styles.baseUrlInner}>
          <div className={styles.baseUrlLabel}>Base URL</div>
          <code className={styles.baseUrlCode}>https://api-app.keepitsimplestorage.com/api/v2</code>
        </div>
      </div>
    </section>
  );
}

function PlatformGlance() {
  return (
    <section className={styles.audiences}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          The KISS platform at a glance
        </Heading>
        <p className={styles.glanceLead}>
          KISS locks are NFC devices with no battery and no network connection. The tenant&rsquo;s
          phone powers and operates the lock through a tap. Because the lock itself is offline,
          everything intelligent happens in the apps and the platform behind them.
        </p>
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <Heading as="h3" className={styles.cardTitle}>
              KISS Access app
            </Heading>
            <p className={styles.cardDescription}>
              Tenants sign in with their mobile number and a one-time SMS code, then open their
              lock with an NFC tap. The app holds a signed access bundle and refreshes it on launch
              and in the background, so it keeps working offline.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4l-5.6 5.6a2 2 0 0 0 0 2.8l.4.4a2 2 0 0 0 2.8 0l5.6-5.6a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.1-2.1z" />
              </svg>
            </div>
            <Heading as="h3" className={styles.cardTitle}>
              KISS Manager app
            </Heading>
            <p className={styles.cardDescription}>
              Used by site staff: installing and assigning locks to units, opening units when
              needed, and applying manual overrides such as an on-site lockout or an exemption.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <Heading as="h3" className={styles.cardTitle}>
              Web admin portal
            </Heading>
            <p className={styles.cardDescription}>
              Browser console for company settings, locations, units, access logs, and API tokens.
              Managers sign in with email and password.
            </p>
          </div>
        </div>
        <p className={styles.glanceLead}>
          <strong>The API is the fourth piece.</strong> Your system keeps each unit&rsquo;s business
          facts current (who rents it, whether they are paid up, whether it should be overlocked).
          KISS evaluates those facts into an access decision and delivers it to the tenant&rsquo;s
          app. One business event becomes one HTTP call.
        </p>
      </div>
    </section>
  );
}

function QuickLinks() {
  const links = [
    {
      title: 'How access works',
      description: 'Units, facts, the access evaluator, entry points, and NFC keys.',
      to: '/docs/guides/concepts',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      title: 'Authentication',
      description: 'Bearer tokens and scopes for partners; OTP sign-in for tenants.',
      to: '/docs/guides/authentication',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      title: 'PMS integration',
      description: 'Push tenancy, balance, and overlock state from your system into KISS.',
      to: '/docs/guides/pms/quickstart',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 16 12 12 8 16" />
          <line x1="12" y1="12" x2="12" y2="21" />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
        </svg>
      ),
    },
    {
      title: 'Error handling',
      description: 'Response envelope, status codes, idempotency, and troubleshooting.',
      to: '/docs/guides/error-handling',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <section className={styles.quickLinks}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Quick links
        </Heading>
        <div className={styles.linkGrid}>
          {links.map((link) => (
            <Link key={link.title} className={styles.linkCard} to={link.to}>
              <div className={styles.linkIcon}>{link.icon}</div>
              <div>
                <Heading as="h3" className={styles.linkTitle}>
                  {link.title}
                </Heading>
                <p className={styles.linkDescription}>{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Home"
      description="API documentation for Keep It Simple Storage — integrate smart storage access, NFC locks, and tenant management into your platform.">
      <Hero />
      <main>
        <BaseUrl />
        <PlatformGlance />
        <QuickLinks />
      </main>
    </Layout>
  );
}
