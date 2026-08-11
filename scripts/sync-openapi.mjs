// Fetches the live Scramble OpenAPI spec, keeps only the partner-facing
// endpoints (the curated allowlist), down-converts 3.1 -> 3.0.3 so the
// Docusaurus OpenAPI plugin can render it, and writes openapi/kiss-api.json.
//
// Run: node scripts/sync-openapi.mjs
// The full spec lives at the source URL; this is the curated slice the portal
// renders as Quo-style endpoint pages. The "Full API spec" link points callers
// at the complete surface.

import {writeFileSync, readFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

// kiss-api serves the partner slice publicly at /docs/partner-api.json. The
// full spec at /docs/api.json is gated on a session user, so a build could
// never fetch it: the fetch 403'd, the catch below kept the committed copy, and
// the portal quietly froze.
//
// This is the app domain, not api-app: bootstrap/app.php scopes routes/web.php
// (where the route lives) to APP_DOMAIN, so the API host 404s it. The API base
// URL partners call is still api-app.
//
// Point OPENAPI_SOURCE at a local file (e.g. the output of
// `php artisan scramble:export`) to regenerate from a spec in hand.
const SOURCE = process.env.OPENAPI_SOURCE || 'https://app.keepitsimplestorage.com/docs/partner-api.json';
const OUT = 'openapi/kiss-api.json';

// Curated, partner-facing endpoints (by Scramble operationId). kiss-api applies
// its own allowlist before serving the spec, so this is an intersection rather
// than the only gate. Kept deliberately: if the two ever disagree, an endpoint
// stays unpublished until both sides list it, which is the safe direction for a
// public site. Consolidate into the app once that side has proven itself.
const ALLOW = new Set([
  'v2.access',
  'v2.units.index',
  'v2.units.show',
  'v2.units.sync',
  'v2.units.patch',
  'v2.units.tenancy.put',
  'v2.units.tenancy.delete',
  'v2.tenants.index',
  'v2.tenants.show',
  'v2.tenants.patch',
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
    summary: 'Get user access',
    description:
      "Everything the signed-in user's app needs to operate offline: their units with the evaluated access state, the entry points for their zones, the NFC keys, and the facility timezone. Authenticated with the user's Bearer token. Cache it and refresh on launch / pull-to-refresh.",
  },
  'v2.units.index': {
    summary: 'List units',
    description:
      'Lists the units in your company, each carrying both IDs: your own `external_unit_id` and the KISS `unit_id` (a ULID). This is the mapping to store if you want to address single units by ULID. Results are paged (15 per page, `per_page` up to 100) with paging details in `meta.pagination`, and can be narrowed to one store with `filter[location]` or `filter[external_location_code]`. Supports conditional requests via `ETag` / `If-None-Match`.',
  },
  'v2.units.show': {
    summary: 'Get a unit',
    description: 'Fetch a single unit by its KISS `unit_id` (ULID).',
  },
  'v2.units.sync': {
    summary: 'Create or update units',
    description:
      'Create or update up to 500 units in one idempotent call, matched on your `external_unit_id`. Unknown IDs create units, known IDs update their facts. This is the only write keyed on your own IDs, so you can change any unit fact (occupancy, lockout, balance, auction, move-in) without storing KISS ULIDs; send a single-item `units` array to update one unit by `external_unit_id`. Use it for the initial roster load and periodic reconciliation. Every applied unit comes back in `data.results` with its KISS `unit_id`, so you can record the mapping without a second call. Per-item failures come back in `data.errors` with a `200`; a batch where every item failed answers `422` with the same body.',
  },
  'v2.units.patch': {
    summary: 'Update unit facts',
    description:
      "Sparse update of one unit's access facts (overlock, exemption, auction, unrentable, balance, occupancy). Addressed by the KISS `unit_id` (ULID), so reach for it when you already hold the ULID (from `GET /units`). To update by your own `crm_unit_id` instead, send a one-item batch to `PATCH /units`. Send only the fields that changed.",
  },
  'v2.units.tenancy.put': {
    summary: 'Assign primary user',
    description:
      "Addressed by the unit's KISS `unit_id` (ULID). Set the unit's single primary user (the owner). Marks the unit occupied, sets the move-in date, clears any lockout, and (with a `tenant` block) creates or updates that user so they can claim the unit in the app. If the unit already has a primary user, this REPLACES them — the prior primary link is overwritten (guest / secondary accessors are left attached). Adding a guest is a separate flow, not this endpoint.",
  },
  'v2.units.tenancy.delete': {
    summary: 'Remove primary user',
    description:
      "Addressed by the unit's KISS `unit_id` (ULID). End the primary tenancy and reset the unit to vacant (no request body). Clears occupied, the primary-user link, pms_tenant_id, move_in_date, balance_due (to 0), paid_through_date, pms_lockout, pms_auction, pms_unrentable, and pms_status_raw, and detaches secondary accessors. Returns 404 for an unknown unit.",
  },
  'v2.tenants.index': {
    summary: 'List tenants',
    description:
      "Lists the tenants at your locations, each carrying both ids: your own `external_tenant_id` and the KISS `tenant_id` (a ULID), along with their name, `phone_number`, location, and `type`. Results are paged (15 per page, `per_page` up to 100) with paging details in `meta.pagination`, and can be narrowed with `filter[location]`, `filter[external_location_code]`, `filter[external_tenant_id]`, or `filter[type]`. Supports conditional requests via `ETag` / `If-None-Match`. A row with a null `external_tenant_id` is a tenant KISS holds that carries no id from your system, identified by `phone_number`; see the [sync guide](/guides/pms/quickstart#tenants-you-did-not-create) before writing your own id onto one. Needs the `tenants:read` scope.",
    dropParams: ['filter[full_name]', 'archived', 'include', 'sort'],
    pickResponse: 0,
  },
  'v2.tenants.show': {
    summary: 'Get a tenant',
    description:
      'Fetch a single tenant by their KISS `tenant_id` (ULID), returning the same fields as `GET /tenants`. Supports conditional requests via `ETag` / `If-None-Match`. Returns `404` for a tenant outside the locations your token reaches. Needs the `tenants:read` scope.',
    dropParams: ['include'],
    pickResponse: 0,
  },
  'v2.tenants.patch': {
    summary: 'Correct a tenant',
    description:
      "Correct a tenant's `first_name`, `last_name`, or `phone` (at least one required; nothing else is accepted). Addressed by the KISS `tenant_id` (ULID). Returns the corrected tenant in the same shape as `GET /tenants/{tenant_id}`, plus `meta.warnings`, which is always present and flags a phone number shared with another account. Answers `409` for a tenant with no id from your system, an ambiguous target, or (for a name) one that spans locations your token doesn't reach; see the [correction guide](/guides/pms/quickstart#correcting-a-tenant) for each case. Needs the `tenants:write` scope.",
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
const TAG_ORDER = ['Units', 'Tenants', 'Access', 'Logs', 'Health'];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

/**
 * Collapse a union 200 body down to one branch. Leaves the operation untouched
 * if the schema is not a union, so a spec change that drops the union does not
 * silently publish the wrong shape.
 */
function pickResponseVariant(op, index) {
  const schema = op.responses?.['200']?.content?.['application/json']?.schema;
  if (!schema || !Array.isArray(schema.anyOf)) return;

  const picked = schema.anyOf[index];
  if (!picked) {
    throw new Error(`${op.operationId}: pickResponse ${index} is out of range (${schema.anyOf.length} variants)`);
  }

  op.responses['200'].content['application/json'].schema = picked;
}

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

async function loadSpec() {
  if (!/^https?:/.test(SOURCE)) {
    return JSON.parse(readFileSync(SOURCE, 'utf8'));
  }

  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return res.json();
}

async function main() {
  let spec;
  try {
    spec = await loadSpec();
  } catch (err) {
    if (existsSync(OUT)) {
      console.warn(
        `[sync-openapi] WARNING: fetch of ${SOURCE} failed (${err.message}).\n` +
        `[sync-openapi] Publishing the committed ${OUT} instead, which may be behind the API. ` +
        'The site will build and look healthy either way, so check this if the reference looks stale.'
      );
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
          // Endpoints shared with the staff surface document both callers'
          // parameters. Publishing the staff-only ones here would advertise
          // query params a company token silently ignores.
          if (meta.dropParams && Array.isArray(op.parameters)) {
            op.parameters = op.parameters.filter((p) => !meta.dropParams.includes(p.name));
          }
          // Same reason as dropParams, for the body: an endpoint serving both
          // callers documents its 200 as a union of the two shapes, and only
          // one of them is what a partner will ever receive.
          if (typeof meta.pickResponse === 'number') {
            pickResponseVariant(op, meta.pickResponse);
          }
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
        'Need an endpoint that is not here? Contact your KISS rep.',
    },
    servers: spec.servers,
    tags,
    paths: keptPaths,
    components: spec.components,
    security: spec.security,
  };

  downConvert(out);

  mkdirSync(dirname(OUT), {recursive: true});
  const serialized = JSON.stringify(out, null, 2) + '\n';
  writeFileSync(OUT, serialized);
  // Publish the curated spec as a static download too (the reference "Export"
  // button points here). Only the curated slice ships, never the full spec.
  const STATIC_OUT = 'static/openapi/kiss-api.json';
  mkdirSync(dirname(STATIC_OUT), {recursive: true});
  writeFileSync(STATIC_OUT, serialized);
  console.log(`[sync-openapi] wrote ${OUT} (+ ${STATIC_OUT}): ${kept} operations across ${tags.length} tags`);
}

main();
