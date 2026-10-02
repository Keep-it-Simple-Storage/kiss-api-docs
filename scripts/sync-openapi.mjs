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
const STATIC_OUT = 'static/openapi/kiss-api.json';
// OPENAPI_DRY_RUN=1 runs every transform and guard but writes nothing (the
// sync tests use it). OPENAPI_NO_FALLBACK=1 makes a failed fetch fatal instead
// of falling back to the committed snapshot.
const DRY_RUN = process.env.OPENAPI_DRY_RUN === '1';
const NO_FALLBACK = process.env.OPENAPI_NO_FALLBACK === '1';
const DOCS_URL = 'https://docs.keepitsimplestorage.com';

// Curated, partner-facing endpoints (by Scramble operationId). kiss-api applies
// its own allowlist before serving the spec, so this is an intersection rather
// than the only gate. Kept deliberately: if the two ever disagree, an endpoint
// stays unpublished until both sides list it, which is the safe direction for a
// public site. Consolidate into the app once that side has proven itself.
const ALLOW = new Set([
  'v2.access',
  'v2.auth.tenant-tokens.store',
  'v2.units.index',
  'v2.units.show',
  'v2.units.sync',
  'v2.units.patch',
  'v2.units.tenancy.put',
  'v2.units.tenancy.delete',
  'v2.tenants.index',
  'v2.tenants.show',
  'v2.tenants.patch',
  'v2.access-logs.index',
  'v2.locks.logs.store',
  'v2.entry-points.logs.store',
  'v2.health',
]);

// The two log endpoints' request bodies. Upstream, their field descriptions
// come from code comments in kiss-api, which are written for maintainers, not
// partners. So the published body is an ALLOWLIST: only the fields below are
// published, each with this partner copy in place of whatever upstream says.
//
// - A field upstream adds (e.g. one partners are not asked to send yet) is
//   dropped, with a warning, until it is listed here.
// - A field listed here that upstream no longer has (a rename) fails the sync,
//   so the copy cannot silently fall back to the raw upstream text.
//
// Links are absolute: these strings also ship in the downloadable spec.
const REPORTING_A_TAP = `${DOCS_URL}/guides/white-label/quickstart#reporting-a-tap`;
const LOG_BODY_PROPS = (prefix) => ({
  key:
    `What happened on the tap, as the tenant was shown it. On this endpoint use a \`${prefix}.*\` value; ` +
    `see [Reporting a tap](${REPORTING_A_TAP}) for which one to send.`,
  reason:
    `Required when \`key\` is \`${prefix}.open_failure\` or \`${prefix}.close_failure\`, optional otherwise. ` +
    'On a failure, short text saying what went wrong. On an unconfirmed key, the cause token for that outcome; ' +
    `see [Reporting a tap](${REPORTING_A_TAP}).`,
  happened_at: 'When the tap happened on the device (ISO 8601). Send it to backfill a tap recorded while offline.',
  app_version: 'Optional: your app\'s version, e.g. `2.4.0`. Up to 20 characters.',
  app_build: 'Optional: your app\'s build number. Up to 20 characters.',
  platform: 'Optional: `ios` or `android`. You can send it in the `X-Client-Platform` header instead.',
  error_code:
    'Why the tap failed, as one of the server\'s snake_case error codes (see ' +
    `[Reporting a tap](${REPORTING_A_TAP})). Any other value is accepted but stored as null.`,
  first_error_code: 'The error code of the first failed attempt, when the tap took more than one. Same values as `error_code`.',
  duration_ms: 'Optional: how long the whole interaction took, in milliseconds, including any retries.',
  attempt_count: 'Optional: how many attempts the interaction took, counting the first.',
  nfc_antenna_profile: 'Optional. Leave it out unless KISS asks you to send it.',
  scanned_lock_serial: 'The lock the phone actually reached: `0x` followed by the lock SDK\'s `session.lockId`.',
  field_lost_after_start:
    '`true` when the lock started the action and the phone moved away before it finished (the lock SDK\'s ' +
    '`fieldLostAfterStart` outcome). Send it with the successful key.',
  package: 'Optional: the name of the library that ran the tap, for diagnostics.',
  package_version: 'Optional: the version of that library.',
  client_now: 'Optional: the device\'s current time when it sends the log (ISO 8601), so KISS can spot a phone clock that is wrong.',
});

// Log fields the API accepts but partners are not asked to send yet. They are
// already excluded by the allowlist above; naming them also lets the final
// guard fail the sync if one reaches the log endpoints' output any other way
// (a parameter, an example, an inline schema).
const WITHHELD_LOG_FIELDS = ['outcome', 'lock_fw_version', 'lock_fw_build', 'battery_mv'];

// Final guard on everything the sync publishes. A match fails the sync (and so
// the Netlify deploy) rather than publishing it.
const LEAK_PATTERN = /KEEP-\d+|kiss_core|tapt_nfc|SmAcK|ST25|ISO ?15693|NAC1080|kiss_mobile_apps|\bApp\.(Http|Models)\./i;
// Checked only within the log endpoints and their schemas: `outcome` is a
// legitimate field elsewhere (e.g. the unit sync results).
const WITHHELD_PATTERN = /"outcome"|lock_fw_|battery_mv/i;
const LOG_OPERATIONS = ['v2.locks.logs.store', 'v2.entry-points.logs.store'];

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
  'v2.auth.tenant-tokens.store': {
    summary: 'Sign a tenant in',
    description:
      "Exchange your company API token plus the tenant's ID in your own system (`external_tenant_id`, the same value `GET /tenants` returns) for a short-lived access token scoped to that tenant. Your app sends it as `Authorization: Bearer <token>` on `GET /access` and hands it to the lock SDK, so your users never see a KISS login screen on top of your own. The token lasts 15 minutes; hold it for the session and mint a fresh one when it expires. Needs the `tenants:auth` scope.",
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
    summary: 'Update a tenant',
    description:
      "Update a tenant's `first_name`, `last_name`, or `phone`, re-key their `external_tenant_id` when the id you gave earlier has changed, or claim a tenant that carries none of your ids by sending `external_tenant_id` with a `phone` matching what KISS already has on file. Send at least one. Addressed by the KISS `tenant_id` (ULID). A re-key or claim moves the id everywhere the tenant is used, so their units and any linked guests move with it. A claim's `phone` is proof only and is never written; it answers `409 claim_phone_required` when missing, `409 claim_phone_mismatch` when it does not parse or does not match what KISS holds, and `409 claim_raced` if a concurrent write already linked the tenant to a different id first. Both a re-key and a claim answer `409 external_tenant_id_conflict` if another tenant already holds the id. Returns the updated tenant in the same shape as `GET /tenants/{tenant_id}`, plus `meta.warnings`. Answers `409` for a non-claim write to a tenant carrying no id from your system, an ambiguous target, or a change that reaches locations your token cannot; see [Updating a tenant](/guides/pms/quickstart#updating-a-tenant). Needs the `tenants:write` scope.",
  },
  'v2.access-logs.index': {
    summary: 'List access logs',
    description:
      'Paginated feed of access events (lock opens/closes, gate activations, unit-access changes) across your locations. ' +
      'Each log carries three timestamps: `effective_at` is the one to sort and display — it equals `happened_at` when the device reported one, ' +
      'falling back to `created_at` (server receipt) for older hardware or offline-uploaded events where `happened_at` is null. ' +
      'Filter by `location`, `unit`, `key` (e.g. `lock.open_successful`), `log_type` (`units` / `entrypoints` / `locks`), and date range (`from` / `to` on `effective_at`). ' +
      'Results are paged (15 per page, `per_page` up to 100) with details in `meta.pagination`. Supports conditional requests via `ETag` / `If-None-Match` with a 60-second cache window. ' +
      'Needs the `read:logs` scope.',
  },
  'v2.locks.logs.store': {
    summary: 'Report lock activity',
    description:
      'Record a lock event (open or close: success, failure, or blocked) after an NFC interaction.',
    paramDescriptions: {
      lock: "The lock's `id` (a ULID) from `GET /access`, at `bundles[].lock.id`. Not its `serial_number`.",
    },
    bodyProps: LOG_BODY_PROPS('lock'),
  },
  'v2.entry-points.logs.store': {
    summary: 'Report entry-point activity',
    description:
      'Record an entry-point event (gate or door) after an NFC interaction.',
    paramDescriptions: {
      entryPoint: "The entry point's `id` (a ULID) from `GET /access`, at `entry_points[].id`.",
    },
    bodyProps: LOG_BODY_PROPS('entry_point'),
    // Not published: the endpoint ignores it, and a value it does not know
    // answers 422, so the tap is never recorded. Partners should omit it.
    omitBodyProps: ['zone_id'],
  },
  'v2.health': {
    summary: 'Health check',
    description: 'Liveness probe. Returns `200` when the API is up.',
  },
};

// Sidebar/category order for the kept tags.
const TAG_ORDER = ['Units', 'Tenants', 'Access', 'Access Logs', 'Logs', 'Health'];

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

const SCHEMA_REF_PREFIX = '#/components/schemas/';

/**
 * Apply an endpoint's body allowlist (see LOG_BODY_PROPS). The body must be a
 * $ref to a component schema that no other operation uses, so the overrides
 * land on exactly one published schema; anything else fails the sync.
 */
function applyBodyProps(spec, op, meta, claimed) {
  const media = op.requestBody?.content?.['application/json'];
  const ref = media?.schema?.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(SCHEMA_REF_PREFIX)) {
    throw new Error(`${op.operationId}: request body is not a $ref to a component schema, so its overrides cannot be applied`);
  }
  const name = ref.slice(SCHEMA_REF_PREFIX.length);
  const schema = spec.components?.schemas?.[name];
  if (!schema?.properties) {
    throw new Error(`${op.operationId}: request body schema ${name} is missing or has no properties`);
  }
  if (claimed.has(name)) {
    throw new Error(`${op.operationId}: request body schema ${name} is also used by ${claimed.get(name)}; give each its own schema`);
  }
  claimed.set(name, op.operationId);

  const missing = Object.keys(meta.bodyProps).filter((prop) => !(prop in schema.properties));
  if (missing.length) {
    throw new Error(`${op.operationId}: listed body field(s) not in the upstream schema (renamed?): ${missing.join(', ')}`);
  }

  const dropped = Object.keys(schema.properties).filter((prop) => !(prop in meta.bodyProps));
  for (const prop of dropped) delete schema.properties[prop];
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter((r) => r in meta.bodyProps);
    if (!schema.required.length) delete schema.required;
  }
  const known = new Set([...WITHHELD_LOG_FIELDS, ...(meta.omitBodyProps || [])]);
  const unexpected = dropped.filter((prop) => !known.has(prop));
  if (unexpected.length) {
    console.warn(
      `[sync-openapi] WARNING: ${op.operationId}: new upstream body field(s) not published: ${unexpected.join(', ')}. ` +
      'Add them to LOG_BODY_PROPS with partner copy to publish them.'
    );
  }

  for (const [prop, description] of Object.entries(meta.bodyProps)) {
    schema.properties[prop].description = description;
  }

  // Examples are written upstream too, and may show a dropped field.
  const mentionsDropped = (node) => dropped.some((prop) => JSON.stringify(node).includes(`"${prop}"`));
  for (const holder of [media, schema, ...Object.values(schema.properties)]) {
    for (const key of ['example', 'examples']) {
      if (key in holder && (holder === media || mentionsDropped(holder[key]))) delete holder[key];
    }
  }
}

/** Apply partner descriptions to path parameters, at path level and operation level. */
function applyParamDescriptions(op, pathItem, meta) {
  const params = [...(pathItem.parameters || []), ...(op.parameters || [])];
  for (const [name, description] of Object.entries(meta.paramDescriptions)) {
    const matches = params.filter((p) => p?.name === name);
    if (!matches.length) {
      throw new Error(`${op.operationId}: parameter "${name}" not found (renamed?), so its description cannot be applied`);
    }
    for (const p of matches) p.description = description;
  }
}

/** Every component $ref reachable from the kept paths, following refs inside components. */
function referencedComponents(paths, components) {
  const seen = new Set();
  const queue = [paths];
  while (queue.length) {
    const node = queue.pop();
    if (Array.isArray(node)) { queue.push(...node); continue; }
    if (!node || typeof node !== 'object') continue;
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#/components/') && !seen.has(node.$ref)) {
      seen.add(node.$ref);
      const [, , section, name] = node.$ref.split('/');
      const target = components?.[section]?.[name];
      if (target) queue.push(target);
    }
    queue.push(...Object.values(node));
  }
  return seen;
}

/**
 * Keep only the schemas and responses a kept operation references, and give
 * schemas named after server classes (`App.Http.Requests...`) their short
 * name, so internal namespaces do not ship.
 */
function pruneComponents(paths, components) {
  if (!components) return components;
  const used = referencedComponents(paths, components);
  const out = {...components};
  for (const section of ['schemas', 'responses']) {
    if (!components[section]) continue;
    out[section] = Object.fromEntries(
      Object.entries(components[section]).filter(([name]) => used.has(`#/components/${section}/${name}`))
    );
  }

  const renames = {};
  for (const name of Object.keys(out.schemas || {})) {
    if (!name.includes('.')) continue;
    const short = name.split('.').pop();
    if (out.schemas[short] || Object.values(renames).includes(short)) {
      throw new Error(`schema ${name} would be renamed to ${short}, which already exists`);
    }
    renames[name] = short;
  }
  for (const [from, to] of Object.entries(renames)) {
    out.schemas[to] = out.schemas[from];
    delete out.schemas[from];
  }
  for (const schema of Object.values(out.schemas || {})) {
    if (typeof schema.title === 'string' && (schema.title.includes('.') || renames[schema.title])) delete schema.title;
  }
  const rewrite = (node) => {
    if (Array.isArray(node)) return node.forEach(rewrite);
    if (!node || typeof node !== 'object') return;
    if (typeof node.$ref === 'string' && node.$ref.startsWith(SCHEMA_REF_PREFIX)) {
      const name = node.$ref.slice(SCHEMA_REF_PREFIX.length);
      if (renames[name]) node.$ref = SCHEMA_REF_PREFIX + renames[name];
    }
    Object.values(node).forEach(rewrite);
  };
  rewrite(paths);
  rewrite(out);
  return out;
}

/** Fail on anything that must not be published. */
function guard(out) {
  const problems = [];
  const all = JSON.stringify(out);
  const leak = all.match(LEAK_PATTERN);
  if (leak) problems.push(`internal reference "${leak[0]}" near: ${all.slice(Math.max(0, leak.index - 80), leak.index + 40)}`);

  for (const item of Object.values(out.paths || {})) {
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !LOG_OPERATIONS.includes(op?.operationId)) continue;
      const refs = [...referencedComponents({op, params: item.parameters}, out.components)];
      const scope = JSON.stringify([op, item.parameters, refs.map((r) => {
        const [, , section, name] = r.split('/');
        return out.components?.[section]?.[name];
      })]);
      const hit = scope.match(WITHHELD_PATTERN);
      if (hit) problems.push(`${op.operationId}: withheld field "${hit[0]}" would be published`);
    }
  }

  if (problems.length) {
    throw new Error('refusing to publish:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  }
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
    // A local source is a deliberate input, so it never falls back.
    if (!NO_FALLBACK && /^https?:/.test(SOURCE) && existsSync(OUT)) {
      console.warn(
        `[sync-openapi] WARNING: fetch of ${SOURCE} failed (${err.message}).\n` +
        `[sync-openapi] Publishing the committed ${OUT} instead, which may be behind the API. ` +
        'The site will build and look healthy either way, so check this if the reference looks stale.'
      );
      // The committed copy still has to pass the guard.
      guard(JSON.parse(readFileSync(OUT, 'utf8')));
      return;
    }
    throw new Error(`could not load ${SOURCE} (${err.message})`);
  }

  // Keep only allowlisted operations.
  const keptPaths = {};
  const claimed = new Map(); // component schema -> the operation whose body overrides it
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
          if (meta.paramDescriptions) applyParamDescriptions(op, item, meta);
          if (meta.bodyProps) applyBodyProps(spec, op, meta, claimed);
        }
        keptItem[method] = op;
        kept++;
      }
    }
    if (Object.keys(keptItem).some((m) => HTTP_METHODS.has(m.toLowerCase()))) {
      keptPaths[path] = keptItem;
    }
  }

  const found = new Set();
  for (const item of Object.values(keptPaths))
    for (const [method, op] of Object.entries(item))
      if (HTTP_METHODS.has(method.toLowerCase()) && op?.operationId) found.add(op.operationId);

  const missing = [...ALLOW].filter((id) => !found.has(id));
  if (missing.length) {
    console.warn(
      `[sync-openapi] WARNING: ${missing.length} allowlisted operation(s) are not in ${SOURCE}:\n` +
      missing.map((id) => `[sync-openapi]   - ${id}`).join('\n') + '\n' +
      '[sync-openapi] They will not be published, no reference page is generated for them, and any\n' +
      '[sync-openapi] guide link to one will fail the Docusaurus build as a broken link. Check that\n' +
      '[sync-openapi] the endpoint is deployed and listed in PartnerApiSpec::OPERATIONS in kiss-api.'
    );
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
    components: pruneComponents(keptPaths, spec.components),
    security: spec.security,
  };

  downConvert(out);
  guard(out);

  const serialized = JSON.stringify(out, null, 2) + '\n';
  if (DRY_RUN) {
    console.log(`[sync-openapi] dry run: ${kept} operations across ${tags.length} tags passed every check`);
    return;
  }
  mkdirSync(dirname(OUT), {recursive: true});
  writeFileSync(OUT, serialized);
  // Publish the curated spec as a static download too (the reference "Export"
  // button points here). Only the curated slice ships, never the full spec.
  mkdirSync(dirname(STATIC_OUT), {recursive: true});
  writeFileSync(STATIC_OUT, serialized);
  console.log(`[sync-openapi] wrote ${OUT} (+ ${STATIC_OUT}): ${kept} operations across ${tags.length} tags`);
}

main().catch((err) => {
  console.error(`[sync-openapi] ERROR: ${err.message}`);
  process.exit(1);
});
