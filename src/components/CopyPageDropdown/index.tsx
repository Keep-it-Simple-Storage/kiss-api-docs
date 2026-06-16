import {useState, useRef, useEffect, type ReactNode} from 'react';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './styles.module.css';

function mdPath(permalink: string): string {
  const slug = permalink === '/' ? '/index' : permalink.replace(/\/$/, '');
  return `/md${slug}.md`;
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function Caret() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function CopyPageDropdown(): ReactNode {
  const {metadata} = useDoc();
  const {siteConfig} = useDocusaurusContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const mdHref = mdPath(metadata.permalink);
  const mdUrl = `${siteConfig.url}${mdHref}`;
  const prompt = `Read ${mdUrl} (the KISS API docs page "${metadata.title}") and help me with it.`;
  const chatgpt = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  const claude = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

  async function copyMarkdown() {
    try {
      const res = await fetch(mdHref);
      await navigator.clipboard.writeText(await res.text());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* fetch/clipboard unavailable */
    }
    setOpen(false);
  }

  function openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}>
        <CopyIcon />
        {copied ? 'Copied!' : 'Copy page'}
        <Caret />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" className={styles.item} role="menuitem" onClick={copyMarkdown}>
            <span className={styles.itemTitle}>Copy page as Markdown</span>
            <span className={styles.itemSub}>Copy this page for an LLM</span>
          </button>
          <button type="button" className={styles.item} role="menuitem" onClick={() => openUrl(mdUrl)}>
            <span className={styles.itemTitle}>View as Markdown</span>
            <span className={styles.itemSub}>Open the plain-text version</span>
          </button>
          <button type="button" className={styles.item} role="menuitem" onClick={() => openUrl(chatgpt)}>
            <span className={styles.itemTitle}>Open in ChatGPT</span>
            <span className={styles.itemSub}>Ask about this page</span>
          </button>
          <button type="button" className={styles.item} role="menuitem" onClick={() => openUrl(claude)}>
            <span className={styles.itemTitle}>Open in Claude</span>
            <span className={styles.itemSub}>Ask about this page</span>
          </button>
        </div>
      )}
    </div>
  );
}
