import React, {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import BrowserOnly from '@docusaurus/BrowserOnly';
import {useTypedSelector} from '@theme/ApiItem/hooks';
import {API_BASE_URL} from '@site/src/lib/apiBase';

import styles from './styles.module.css';

// Swizzled from docusaurus-theme-openapi-docs to: put the method pill OUTSIDE
// a content-sized URL box (the stock version wraps both in one oversized
// <pre>), and add click-to-copy on the full URL.

function CopyGlyph({copied}: {copied: boolean}): ReactNode {
  return copied ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function EndpointUrl({path}: {path: string}): ReactNode {
  const serverValue = useTypedSelector((state: any) => state.server.value);
  const [copied, setCopied] = useState(false);

  let base = '';
  if (serverValue?.variables) {
    base = serverValue.url.replace(/\/$/, '');
    Object.keys(serverValue.variables).forEach((v) => {
      base = base.replace(`{${v}}`, serverValue.variables?.[v]?.default ?? '');
    });
  } else if (serverValue?.url) {
    base = serverValue.url.replace(/\/$/, '');
  }
  // Fall back to the fixed base URL: on static reference pages the server
  // value can be empty, and we always want to show/copy the full URL.
  const url = (base || API_BASE_URL) + path;

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span className={styles.urlBox}>
      <code className={styles.url}>{url}</code>
      <button type="button" className={styles.copy} onClick={copy} title="Copy URL" aria-label="Copy URL">
        <CopyGlyph copied={copied} />
      </button>
    </span>
  );
}

export default function MethodEndpoint({
  method,
  path,
  context,
}: {
  method: string;
  path: string;
  context?: string;
}): ReactNode {
  const isEvent = method === 'event';
  const display = path.replace(/{([a-z0-9-_]+)}/gi, ':$1');

  return (
    <>
      <div className={styles.row}>
        <span className={clsx(styles.method, styles[method.toLowerCase()])}>
          {isEvent ? 'Webhook' : method.toUpperCase()}
        </span>
        {!isEvent && context !== 'callback' && (
          <BrowserOnly
            fallback={
              <span className={styles.urlBox}>
                <code className={styles.url}>{API_BASE_URL + display}</code>
              </span>
            }>
            {() => <EndpointUrl path={display} />}
          </BrowserOnly>
        )}
        {!isEvent && context !== 'callback' && (
          <button
            type="button"
            className={styles.tryIt}
            onClick={() => window.dispatchEvent(new CustomEvent('kiss:tryit'))}>
            Try it
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
      </div>
      <div className="openapi__divider" />
    </>
  );
}
