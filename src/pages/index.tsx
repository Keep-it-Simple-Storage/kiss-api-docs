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
          KISS API Documentation
        </Heading>
        <p className={styles.heroSubtitle}>
          Integrate smart storage access into your platform.
          <br />
          Authenticate tenants, manage units, and control NFC locks — all through a simple REST API.
        </p>
        <div className={styles.heroButtons}>
          <Link className={styles.primaryButton} to="/docs/api-reference/kiss-api">
            API Reference
          </Link>
          <Link className={styles.secondaryButton} to="/docs">
            Read the Guides
          </Link>
        </div>
      </div>
    </header>
  );
}

function AudienceCards() {
  return (
    <section className={styles.audiences}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Choose your integration path
        </Heading>
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <Heading as="h3" className={styles.cardTitle}>
              White-Label App Integration
            </Heading>
            <p className={styles.cardDescription}>
              Build a tenant-facing mobile app with NFC lock access. Authenticate tenants via OTP,
              retrieve unit access and keys, and report lock activity back to KISS.
            </p>
            <ul className={styles.cardEndpoints}>
              <li><code>POST /auth/phone</code> — Request OTP</li>
              <li><code>POST /auth/verify-otp</code> — Get bearer token</li>
              <li><code>GET /tenant/access</code> — Units, keys, entry points</li>
              <li><code>POST /locks/&#123;id&#125;/logs</code> — Report lock activity</li>
            </ul>
            <Link className={styles.cardLink} to="/docs/guides/white-label/quickstart">
              Get started &rarr;
            </Link>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            </div>
            <Heading as="h3" className={styles.cardTitle}>
              PMS Push Integration
            </Heading>
            <p className={styles.cardDescription}>
              Sync unit and tenant data from your property management system into KISS.
              One idempotent endpoint — push your current state and KISS reconciles everything.
            </p>
            <ul className={styles.cardEndpoints}>
              <li><code>POST /pms/units/sync</code> — Bulk upsert units</li>
              <li>Move-in = sync with <code>occupied: true</code></li>
              <li>Move-out = sync with <code>occupied: false</code></li>
              <li>Idempotent — safe to retry</li>
            </ul>
            <Link className={styles.cardLink} to="/docs/guides/pms/quickstart">
              Get started &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickLinks() {
  const links = [
    {
      title: 'Authentication',
      description: 'OTP flow for tenants, API tokens for PMS integrators.',
      to: '/docs/guides/white-label/authentication',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    {
      title: 'Concepts',
      description: 'Units, tenants, access states, and the facts-based data model.',
      to: '/docs/guides/concepts',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      title: 'API Reference',
      description: 'Full endpoint reference generated from the OpenAPI spec.',
      to: '/docs/api-reference/kiss-api',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
    },
    {
      title: 'Error Handling',
      description: 'Standard error format, status codes, and troubleshooting.',
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

function BaseUrl() {
  return (
    <section className={styles.baseUrl}>
      <div className="container">
        <div className={styles.baseUrlInner}>
          <div className={styles.baseUrlLabel}>Base URL</div>
          <code className={styles.baseUrlCode}>https://api.keepitsimplestorage.com/api/v1</code>
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
        <AudienceCards />
        <QuickLinks />
      </main>
    </Layout>
  );
}
