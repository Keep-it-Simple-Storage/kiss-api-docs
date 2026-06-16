// Fetches the live Scramble OpenAPI spec, keeps only the partner-facing
// endpoints (the curated allowlist), down-converts 3.1 -> 3.0.3 so the
// Docusaurus OpenAPI plugin can render it, and writes openapi/kiss-api.json.
//
// Run: node scripts/sync-openapi.mjs
// The full spec lives at the source URL; this is the curated slice the portal
// renders as Quo-style endpoint pages. The "Full API spec" link points callers
// at the complete surface.

import {writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const SOURCE = 'https://app.keepitsimplestorage.com/docs/api.json';
const OUT = 'openapi/kiss-api.json';

// Curated, partner-facing endpoints (by Scramble operationId).
const ALLOW = new Set([
  'v2.access',
  'v2.units.index',
  'v2.units.show',
  'v2.units.sync',
  'v2.units.patch',
  'v2.units.tenancy.put',
  'v2.units.tenancy.delete',
  'v2.locks.logs.store',
  'v2.entry-points.logs.store',
  'v2.health',
]);

// Friendly names + blurbs for endpoints the spec doesn't (yet) carry. The
// schemas always come from the live spec; only these human labels are added
// here. Ideal long-term home is the controller docblocks so Scramble emits
// them, at which point this map can shrink.
const META = {
  'v2.access': {
    summary: 'Get the access bundle',
    description:
      "The signed-in user's offline access bundle: their units with evaluated access state, the entry points for their zones, the NFC keys, and the facility timezone. Authenticated with the user's Bearer token. Cache it and refresh on launch / pull-to-refresh.",
  },
  'v2.units.index': {
    summary: 'List units',
    description:
      'Returns every unit in your company with the mapping between your `crm_unit_id` and the KISS `unit_id`. Supports conditional requests via `ETag` / `If-None-Match`.',
  },
  'v2.units.show': {
    summary: 'Get a unit',
    description: 'Fetch a single unit by its KISS `unit_id` (ULID).',
  },
  'v2.units.sync': {
    summary: 'Create or update units',
    description:
      'Create or update up to 500 units in one idempotent call, matched on your `crm_unit_id` — unknown IDs create units, known IDs update their facts. Use it for the initial roster load and periodic reconciliation. Per-item failures come back in `data.errors` with a `200` response.',
  },
  'v2.units.patch': {
    summary: 'Update unit facts',
    description:
      "Sparse update of a unit's access facts (overlock, exemption, auction, unrentable, balance). Send only the fields that changed.",
  },
  'v2.units.tenancy.put': {
    summary: 'Assign primary user',
    description:
      "Set the unit's single primary user (the owner). Marks the unit occupied, sets the move-in date, clears any lockout, and (with a `tenant` block) creates or updates that user so they can claim the unit in the app. If the unit already has a primary user, this REPLACES them — the prior primary link is overwritten (guest / secondary accessors are left attached). Adding a guest is a separate flow (coming via Access Grants), not this endpoint.",
  },
  'v2.units.tenancy.delete': {
    summary: 'Remove primary user',
    description:
      "End the primary tenancy and reset the unit to vacant (no request body). Clears occupied, the primary-user link, pms_tenant_id, move_in_date, balance_due (to 0), paid_through_date, pms_lockout, pms_auction, pms_unrentable, and pms_status_raw, and detaches secondary accessors. Returns 404 for an unknown unit.",
  },
  'v2.locks.logs.store': {
    summary: 'Report lock activity',
    description:
      'Record a lock event (open or close: success, failure, or blocked) after an NFC interaction.',
  },
  'v2.entry-points.logs.store': {
    summary: 'Report entry-point activity',
    description:
      'Record an entry-point event (gate or door) after an NFC interaction.',
  },
  'v2.health': {
    summary: 'Health check',
    description: 'Liveness probe. Returns `200` when the API is up.',
  },
};

// Sidebar/category order for the kept tags.
const TAG_ORDER = ['Units', 'Access', 'Logs', 'Health'];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

/** Recursively rewrite OpenAPI 3.1 constructs into 3.0.3 equivalents. */
function downConvert(node) {
  if (Array.isArray(node)) {
    node.forEach(downConvert);
    return;
  }
  if (!node || typeof node !== 'object') return;

  // type: ["string","null"] -> type: "string", nullable: true
  if (Array.isArray(node.type)) {
    const nonNull = node.type.filter((t) => t !== 'null');
    if (node.type.includes('null')) node.nullable = true;
    if (nonNull.length === 1) node.type = nonNull[0];
    else if (nonNull.length === 0) delete node.type;
    else node.type = nonNull[0]; // 3.0 has no union types; best-effort
  }

  // const: X -> enum: [X]
  if ('const' in node) {
    node.enum = [node.const];
    delete node.const;
  }

  // 3.1-only keywords with no 3.0 equivalent
  delete node.$schema;

  for (const key of Object.keys(node)) downConvert(node[key]);
}

async function main() {
  let spec;
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = await res.json();
  } catch (err) {
    if (existsSync(OUT)) {
      console.warn(`[sync-openapi] fetch failed (${err.message}); keeping existing ${OUT}`);
      return;
    }
    console.error(`[sync-openapi] fetch failed (${err.message}) and no committed spec at ${OUT}`);
    process.exit(1);
  }

  // Keep only allowlisted operations.
  const keptPaths = {};
  let kept = 0;
  for (const [path, item] of Object.entries(spec.paths || {})) {
    const keptItem = {};
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        keptItem[method] = op; // path-level params etc.
        continue;
      }
      if (op && ALLOW.has(op.operationId)) {
        const meta = META[op.operationId];
        if (meta) {
          if (!op.summary) op.summary = meta.summary;
          if (!op.description) op.description = meta.description;
        }
        keptItem[method] = op;
        kept++;
      }
    }
    if (Object.keys(keptItem).some((m) => HTTP_METHODS.has(m.toLowerCase()))) {
      keptPaths[path] = keptItem;
    }
  }

  const usedTags = new Set();
  for (const item of Object.values(keptPaths))
    for (const [m, op] of Object.entries(item))
      if (HTTP_METHODS.has(m.toLowerCase())) (op.tags || []).forEach((t) => usedTags.add(t));

  const tags = (spec.tags || [])
    .filter((t) => usedTags.has(t.name))
    .sort((a, b) => TAG_ORDER.indexOf(a.name) - TAG_ORDER.indexOf(b.name));
  for (const name of usedTags)
    if (!tags.find((t) => t.name === name)) tags.push({name});

  const out = {
    openapi: '3.0.3',
    info: {
      title: 'KISS API Reference',
      version: spec.info?.version ?? 'v2',
      description:
        'This reference covers the endpoints most integrations use. ' +
        'For the complete API surface, see the [full API spec](https://app.keepitsimplestorage.com/docs/api).',
    },
    servers: spec.servers,
    tags,
    paths: keptPaths,
    components: spec.components,
    security: spec.security,
  };

  downConvert(out);

  mkdirSync(dirname(OUT), {recursive: true});
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`[sync-openapi] wrote ${OUT}: ${kept} operations across ${tags.length} tags`);
}

main();
