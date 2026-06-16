// Generates LLM-friendly artifacts for the portal:
//   - static/md/<route>.md   clean Markdown of each guide (for "Copy / View as Markdown")
//   - static/llms.txt         an index map of the portal (the llms.txt convention)
//   - static/llms-full.txt    every guide concatenated, for one-shot ingestion
//
// Runs on `prebuild` so the files land in static/ before `docusaurus build`
// copies static/ into the output. Reference pages are intentionally excluded
// (they are machine-readable already via the OpenAPI spec).

import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';

const SITE_URL = 'https://docs.keepitsimplestorage.com';
const SPEC_URL = 'https://app.keepitsimplestorage.com/docs/api.json';
const REFERENCE_URL = `${SITE_URL}/reference/kiss-api-reference`;

const GUIDES = [
  {src: 'docs/intro.md', route: '/', title: 'Introduction', summary: 'What KISS is, the one-table-many-writers model, and how to choose your integration path.'},
  {src: 'docs/guides/concepts.md', route: '/guides/concepts', title: 'How access works', summary: 'The data model: units, facts, the access evaluator and its precedence, entry points, zones, and NFC keys.'},
  {src: 'docs/guides/authentication.md', route: '/guides/authentication', title: 'Authentication', summary: 'Partner API tokens and scopes, OAuth for multi-company partners, and tenant OTP sign-in.'},
  {src: 'docs/guides/pms/quickstart.md', route: '/guides/pms/quickstart', title: 'Sync partners', summary: 'For systems that push unit and tenant data into KISS: token setup, identifiers, the event-to-call map, endpoint walkthrough, idempotency, and errors.'},
  {src: 'docs/guides/white-label/quickstart.md', route: '/guides/white-label/quickstart', title: 'App partners', summary: 'For teams building their own tenant app on KISS access: OTP sign-in, the GET /access offline bundle, the NFC SDK, and reporting activity.'},
  {src: 'docs/guides/error-handling.md', route: '/guides/error-handling', title: 'Error handling', summary: 'The response envelope, HTTP status codes, idempotency conflicts, and troubleshooting.'},
];

/** Strip frontmatter, MDX imports, and JSX so the result reads as plain Markdown. */
function toMarkdown(raw) {
  let md = raw.replace(/^---\n[\s\S]*?\n---\n/, ''); // frontmatter
  md = md.replace(/^import .*$/gm, ''); // MDX imports
  // <Card title="X" subtitle="Y" ...>desc</Card> -> "- **X** (Y): desc"
  md = md.replace(/<Card\b([^>]*)>([\s\S]*?)<\/Card>/g, (_m, attrs, inner) => {
    const title = (attrs.match(/title="([^"]*)"/) || [])[1] || '';
    const sub = (attrs.match(/subtitle="([^"]*)"/) || [])[1] || '';
    const text = inner.trim().replace(/\s+/g, ' ');
    const head = sub ? `**${title}** (${sub})` : `**${title}**`;
    return `- ${head}: ${text}`;
  });
  md = md.replace(/<\/?Cards[^>]*>/g, ''); // grid wrappers
  md = md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return md;
}

function mdOutPath(route) {
  const slug = route === '/' ? '/index' : route;
  return join('static/md', `${slug}.md`);
}

function write(file, contents) {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, contents);
}

const indexLines = [
  '# KISS API Developer Portal',
  '',
  '> KISS is an access control platform for self-storage. This portal documents the V2 REST API: concepts, integration guides, and a curated endpoint reference. Base URL: https://api-app.keepitsimplestorage.com/api/v2',
  '',
  '## Guides',
  '',
];
const fullParts = ['# KISS API Developer Portal — full guide text\n'];

for (const g of GUIDES) {
  const md = toMarkdown(readFileSync(g.src, 'utf8'));
  write(mdOutPath(g.route), md);
  const mdUrl = `${SITE_URL}${mdOutPath(g.route).replace('static', '')}`;
  indexLines.push(`- [${g.title}](${mdUrl}): ${g.summary}`);
  fullParts.push(`\n\n---\n\n# ${g.title}\n\n${md}`);
}

indexLines.push(
  '',
  '## API reference',
  '',
  `- [Curated endpoint reference](${REFERENCE_URL}): Interactive pages for the partner-facing endpoints.`,
  `- [Full OpenAPI spec](${SPEC_URL}): Complete machine-readable specification.`,
  '',
);

write('static/llms.txt', indexLines.join('\n'));
write('static/llms-full.txt', fullParts.join('\n'));

console.log(`[gen-llms] wrote static/llms.txt, static/llms-full.txt, and ${GUIDES.length} per-page markdown files`);
