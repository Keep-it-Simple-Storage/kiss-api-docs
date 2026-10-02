// Fetches the live Scramble OpenAPI spec, keeps only the partner-facing
// endpoints (the curated allowlist), down-converts 3.1 -> 3.0.3 so the
// Docusaurus OpenAPI plugin can render it, and writes openapi/kiss-api.json
// (plus the identical static/openapi/kiss-api.json download).
//
// Run: node scripts/sync-openapi.mjs
// The full spec lives at the source URL; this is the curated slice the portal
// renders as Quo-style endpoint pages. The "Full API spec" link points callers
// at the complete surface.
//
// The output is public, and upstream text is written for maintainers. So the
// two log endpoints are rebuilt entirely from partner copy here, and a final
// guard walks every published key and string and refuses to write output that
// carries an internal reference. Tests: npm run test:sync.

import {writeFileSync, readFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';

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
// OPENAPI_OUT_DIR writes (and, on fallback, reads) the two output files under
// another directory instead of the repo root (the sync tests use it).
// OPENAPI_DRY_RUN=1 runs every transform and guard but writes nothing.
// OPENAPI_NO_FALLBACK=1 makes a failed fetch fatal instead of falling back to
// the committed snapshot.
const OUT_DIR = process.env.OPENAPI_OUT_DIR || '.';
const OUT = join(OUT_DIR, 'openapi/kiss-api.json');
const STATIC_OUT = join(OUT_DIR, 'static/openapi/kiss-api.json');
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

// ---------------------------------------------------------------------------
// The two log endpoints. Nothing upstream wrote for them is published: each
// operation, its parameters, its request body and its responses are rebuilt
// from the partner copy below. From upstream, only these survive:
// - which listed body fields exist (a listed field missing upstream, e.g. a
//   rename, fails the sync; a new upstream field is not published until it is
//   listed here),
// - each listed field's type keywords (SAFE_FIELD_KEYWORDS), and
// - which `required` fields and approved `enum` values upstream still has.
//
// Links are absolute: these strings also ship in the downloadable spec.
// ---------------------------------------------------------------------------
const REPORTING_A_TAP = `${DOCS_URL}/guides/white-label/quickstart#reporting-a-tap`;
const CLIENT_REPORTABLE_KEYS = ['lock', 'entry_point'].flatMap((p) => [
  `${p}.open_successful`, `${p}.open_failure`, `${p}.open_blocked`,
  `${p}.close_successful`, `${p}.close_successful_confirmed`, `${p}.close_failure`, `${p}.close_blocked`,
  `${p}.open_unconfirmed`, `${p}.close_unconfirmed`,
]);
const LOG_BODY_PROPS = (prefix) => ({
  key: {
    description:
      `What happened on the tap, as the tenant was shown it. On this endpoint use a \`${prefix}.*\` value; ` +
      `see [Reporting a tap](${REPORTING_A_TAP}) for which one to send.`,
    enum: CLIENT_REPORTABLE_KEYS,
  },
  reason:
    `Required when \`key\` is \`${prefix}.open_failure\` or \`${prefix}.close_failure\`, optional otherwise. ` +
    'On a failure, short text saying what went wrong. On an unconfirmed key, the cause token for that outcome; ' +
    `see [Reporting a tap](${REPORTING_A_TAP}).`,
  happened_at: 'When the tap happened on the device (ISO 8601). Send it to backfill a tap recorded while offline.',
  app_version: 'Optional: your app\'s version, e.g. `2.4.0`. Up to 20 characters.',
  app_build: 'Optional: your app\'s build number. Up to 20 characters.',
  platform: {
    description: 'Optional: `ios` or `android`. You can send it in the `X-Client-Platform` header instead.',
    enum: ['ios', 'android'],
  },
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
// The only keywords copied from an upstream field. Anything else (composition,
// nested properties or items, titles, examples, extensions) is either refused
// or dropped.
const SAFE_FIELD_KEYWORDS = ['type', 'format', 'maxLength', 'minLength', 'minimum', 'maximum', 'nullable'];
const NESTING_KEYWORDS = ['allOf', 'oneOf', 'anyOf', 'not', 'properties', 'items', 'additionalProperties',
  'patternProperties', 'prefixItems', '$ref', 'if', 'then', 'else'];
const LOG_RESPONSES = (kind) => {
  const thing = kind === 'lock' ? 'lock' : 'entry point';
  const scope = kind === 'lock' ? 'locks on units they hold' : 'entry points their zones reach';
  return {
    201: {description: 'The tap was recorded. The response uses the standard `{ message, data, meta }` envelope.'},
    401: {description: 'The token is missing, invalid or expired.'},
    403: {description: `The token may not log against this ${thing}. A tenant may only log against ${scope}.`},
    404: {description: `No ${thing} with that \`id\`.`},
    422: {description: 'The body failed validation, or the `Idempotency-Key` header is missing. The tap was not recorded.'},
  };
};

// Log fields the API accepts but partners are not asked to send yet. They are
// not listed above, so they are never published; the guard also fails the sync
// if one shows up in the log endpoints' output any other way.
const WITHHELD_LOG_FIELDS = ['outcome', 'lock_fw_version', 'lock_fw_build', 'battery_mv'];
const LOG_OPERATIONS = ['v2.locks.logs.store', 'v2.entry-points.logs.store'];

// ---------------------------------------------------------------------------
// The final guard. Every published key and string value is normalised (NFKC,
// format characters such as zero-width spaces removed, every dash folded to
// "-") and tested against these. A match fails the sync, and so the deploy,
// rather than publishing it.
// ---------------------------------------------------------------------------
const LEAK_PATTERNS = [
  /\bKEEP[\s_-]*\d+/i,
  /kiss[\s_-]?core/i,
  /tapt[\s_-]?nfc/i,
  /kiss[\s_-]?mobile[\s_-]?apps/i,
  /\bApp(\\+|\.)[A-Z]/,
  /linear\.app/i,
  /github\.com\/Keep-it-Simple-Storage\/(kiss_mobile_apps|kiss-api\b)/i,
  /NAC1080/i, /SmAcK/i, /ST\s?25/i, /ISO\s?15693/i, /NTAG/i, /M24LR/i, /MIFARE/i,
  /lock_sdk_core/i, /uniffi/i,
  // A dotted or backslashed PascalCase path: a server class name (Foo.Bar,
  // Foo\Bar). The live spec has no legitimate one today, so nothing is exempt.
  /\b[A-Z][A-Za-z0-9]*(?:(?:\\+|\.)[A-Z][A-Za-z0-9]*)+\b/,
];
// Strings matching one of these are exempt from the PascalCase-path rule only.
// Keep this list short and explicit.
const PASCAL_PATH_EXEMPT = [];

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
    // Rebuilt from partner copy; see buildLogOperation().
    log: {
      params: {
        lock: "The lock's `id` (a ULID) from `GET /access`, at `bundles[].lock.id`. Not its `serial_number`.",
      },
      body: LOG_BODY_PROPS('lock'),
      responses: LOG_RESPONSES('lock'),
    },
  },
  'v2.entry-points.logs.store': {
    summary: 'Report entry-point activity',
    description:
      'Record an entry-point event (gate or door) after an NFC interaction.',
    log: {
      params: {
        entryPoint: "The entry point's `id` (a ULID) from `GET /access`, at `entry_points[].id`.",
      },
      body: LOG_BODY_PROPS('entry_point'),
      // Not published: the endpoint ignores it, and a value it does not know
      // answers 422, so the tap is never recorded. Partners should omit it.
      omitBody: ['zone_id'],
      responses: LOG_RESPONSES('entry_point'),
    },
  },
  'v2.health': {
    summary: 'Health check',
    description: 'Liveness probe. Returns `200` when the API is up.',
  },
};


// Sidebar/category order for the kept tags.
const TAG_ORDER = ['Units', 'Tenants', 'Access', 'Access Logs', 'Logs', 'Health'];

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const SCHEMA_REF_PREFIX = '#/components/schemas/';

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

/**
 * Rebuild a log endpoint from partner copy (see LOG_BODY_PROPS). Its body must
 * be a $ref to a component schema no other log endpoint uses; that schema is
 * replaced with one rebuilt from the listed fields. Returns the new operation.
 */
function buildLogOperation(spec, op, pathItem, meta, claimed) {
  const id = op.operationId;
  const {log} = meta;

  // Parameters: only the listed ones, rebuilt. Upstream may declare them at
  // path level or operation level.
  const upstreamParams = [...(pathItem.parameters || []), ...(op.parameters || [])].filter(Boolean);
  const parameters = Object.entries(log.params).map(([name, description]) => {
    const up = upstreamParams.find((p) => p.name === name);
    if (!up) throw new Error(`${id}: parameter "${name}" not found (renamed?)`);
    if (up.in !== 'path') throw new Error(`${id}: parameter "${name}" is no longer a path parameter`);
    return {name, in: 'path', required: true, description, schema: {type: 'string'}};
  });
  const extraParams = upstreamParams.filter((p) => !(p.name in log.params)).map((p) => p.name);
  if (extraParams.length) {
    console.warn(`[sync-openapi] WARNING: ${id}: upstream parameter(s) not published: ${extraParams.join(', ')}`);
  }

  // Body.
  const ref = op.requestBody?.content?.['application/json']?.schema?.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(SCHEMA_REF_PREFIX)) {
    throw new Error(`${id}: request body is not a $ref to a component schema, so it cannot be rebuilt`);
  }
  const name = ref.slice(SCHEMA_REF_PREFIX.length);
  const upstream = spec.components?.schemas?.[name];
  if (!upstream?.properties) throw new Error(`${id}: request body schema ${name} is missing or has no properties`);
  if (claimed.has(name)) {
    throw new Error(`${id}: request body schema ${name} is also used by ${claimed.get(name)}; give each its own schema`);
  }
  claimed.set(name, id);

  const properties = {};
  for (const [field, copy] of Object.entries(log.body)) {
    const up = upstream.properties[field];
    if (!up) throw new Error(`${id}: listed body field "${field}" is not in the upstream schema (renamed?)`);
    const nested = NESTING_KEYWORDS.filter((k) => k in up);
    if (nested.length) throw new Error(`${id}: body field "${field}" now uses ${nested.join(', ')}; review it before publishing`);

    const {description, enum: approved} = typeof copy === 'string' ? {description: copy} : copy;
    // 3.1 nullable types are folded here rather than in downConvert(), so the
    // keyword order (and the output) is the same for a 3.1 or 3.0 source.
    const src = {...up};
    if (Array.isArray(src.type)) {
      const nonNull = src.type.filter((t) => t !== 'null');
      if (nonNull.length !== 1) throw new Error(`${id}: body field "${field}" has a union type; review it before publishing`);
      if (src.type.includes('null')) src.nullable = true;
      src.type = nonNull[0];
    }
    const prop = {};
    for (const k of SAFE_FIELD_KEYWORDS) if (k in src) prop[k] = src[k];
    if (approved) {
      const upEnum = Array.isArray(up.enum) ? up.enum : [];
      const published = approved.filter((v) => upEnum.includes(v));
      if (!published.length) throw new Error(`${id}: body field "${field}" has none of its approved enum values upstream`);
      const extra = upEnum.filter((v) => !approved.includes(v));
      if (extra.length || published.length < approved.length) {
        console.warn(`[sync-openapi] WARNING: ${id}: "${field}" enum differs upstream; publishing only approved values present upstream`);
      }
      prop.enum = published;
    }
    prop.description = description;
    properties[field] = prop;
  }
  const known = new Set([...WITHHELD_LOG_FIELDS, ...(log.omitBody || [])]);
  const unexpected = Object.keys(upstream.properties).filter((f) => !(f in log.body) && !known.has(f));
  if (unexpected.length) {
    console.warn(
      `[sync-openapi] WARNING: ${id}: new upstream body field(s) not published: ${unexpected.join(', ')}. ` +
      'Add them to LOG_BODY_PROPS with partner copy to publish them.'
    );
  }
  const required = (Array.isArray(upstream.required) ? upstream.required : []).filter((f) => f in properties);
  spec.components.schemas[name] = {type: 'object', ...(required.length ? {required} : {}), properties};

  return {
    ...(Array.isArray(op.tags) ? {tags: op.tags} : {}),
    operationId: id,
    summary: meta.summary,
    description: meta.description,
    parameters,
    requestBody: {required: true, content: {'application/json': {schema: {$ref: ref}}}},
    responses: structuredClone(log.responses),
    ...(Array.isArray(op.security) ? {security: op.security} : {}),
  };
}

/** Every component $ref reachable from `root`, following refs inside components. */
function referencedComponents(root, components) {
  const seen = new Set();
  const queue = [root];
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
 * Keep only the components a kept operation references (security schemes: the
 * ones named in a `security` requirement), and give every component named
 * after a server class (`App.Http.Requests...`) its short name, in every
 * section, so internal namespaces do not ship.
 */
function pruneComponents(paths, components, security) {
  if (!components) return components;
  const used = referencedComponents(paths, components);
  const schemes = new Set();
  const collectSchemes = (reqs) => (reqs || []).forEach((r) => Object.keys(r || {}).forEach((k) => schemes.add(k)));
  collectSchemes(security);
  for (const item of Object.values(paths))
    for (const [m, op] of Object.entries(item)) if (HTTP_METHODS.has(m)) collectSchemes(op?.security);

  const out = {};
  const renames = {}; // '#/components/<section>/<old>' -> '#/components/<section>/<new>'
  for (const [section, entries] of Object.entries(components)) {
    if (!entries || typeof entries !== 'object') continue;
    const keep = Object.entries(entries).filter(([name]) =>
      section === 'securitySchemes' ? schemes.has(name) : used.has(`#/components/${section}/${name}`)
    );
    const renamed = {};
    for (const [name, value] of keep) {
      const short = /[.\\]/.test(name) ? name.split(/[.\\]+/).pop() : name;
      if (renamed[short] || (short !== name && entries[short] && keep.some(([n]) => n === short))) {
        throw new Error(`component ${section}/${name} would be renamed to ${short}, which already exists`);
      }
      if (short !== name) renames[`#/components/${section}/${name}`] = `#/components/${section}/${short}`;
      if (value && typeof value === 'object' && typeof value.title === 'string' && /[.\\]/.test(value.title)) delete value.title;
      renamed[short] = value;
    }
    if (Object.keys(renamed).length) out[section] = renamed;
  }
  const rewrite = (node) => {
    if (Array.isArray(node)) return node.forEach(rewrite);
    if (!node || typeof node !== 'object') return;
    if (typeof node.$ref === 'string' && renames[node.$ref]) node.$ref = renames[node.$ref];
    Object.values(node).forEach(rewrite);
  };
  rewrite(paths);
  rewrite(out);
  return out;
}

/** NFKC, no format characters (zero-width etc.), every dash folded to "-". */
function normalise(text) {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Pd}−⁃﹣－]/gu, '-');
}

/** Visit every key and string value in a JSON tree, with its location. */
function walkStrings(node, visit, at = '$') {
  if (typeof node === 'string') return visit(node, at);
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, visit, `${at}[${i}]`));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    visit(k, `${at} (key)`);
    walkStrings(v, visit, `${at}.${k}`);
  }
}

/** Fail on anything that must not be published. */
function guard(out, label = 'output') {
  const problems = [];
  walkStrings(out, (raw, at) => {
    const text = normalise(raw);
    for (const pattern of LEAK_PATTERNS) {
      const m = text.match(pattern);
      if (!m) continue;
      if (pattern === LEAK_PATTERNS.at(-1) && PASCAL_PATH_EXEMPT.some((e) => e.test(text))) continue;
      problems.push(`internal reference "${m[0]}" at ${at}`);
      break;
    }
  });

  // Withheld log fields: as a key anywhere in the log endpoints' output, or a
  // firmware/battery field name in any of their strings. (`outcome` as a word
  // is fine in prose, and is a legitimate field on other endpoints.)
  for (const [path, item] of Object.entries(out.paths || {})) {
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method) || !LOG_OPERATIONS.includes(op?.operationId)) continue;
      const refs = [...referencedComponents(op, out.components)].map((r) => {
        const [, , section, name] = r.split('/');
        return out.components?.[section]?.[name];
      });
      walkStrings({op, pathLevel: item.parameters, refs}, (raw, at) => {
        const text = normalise(raw);
        if ((at.endsWith('(key)') && WITHHELD_LOG_FIELDS.includes(text)) || /lock_fw_|battery_mv/i.test(text)) {
          problems.push(`${op.operationId}: withheld field "${text}" at ${path} ${method} ${at}`);
        }
      });
    }
  }

  if (problems.length) {
    throw new Error(`refusing to publish ${label}:\n` + problems.slice(0, 20).map((p) => `  - ${p}`).join('\n'));
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

/** Write the spec and its byte-identical static download. */
function publish(serialized) {
  if (DRY_RUN) return;
  for (const file of [OUT, STATIC_OUT]) {
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, serialized);
  }
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
      // The committed copies still have to pass the guard, and the static
      // download is rewritten from the guarded spec so the two cannot differ.
      const committed = readFileSync(OUT, 'utf8');
      guard(JSON.parse(committed), OUT);
      if (existsSync(STATIC_OUT)) guard(JSON.parse(readFileSync(STATIC_OUT, 'utf8')), STATIC_OUT);
      publish(committed);
      return;
    }
    throw new Error(`could not load ${SOURCE} (${err.message})`);
  }

  // Keep only allowlisted operations.
  const keptPaths = {};
  const claimed = new Map(); // component schema -> the log operation rebuilt onto it
  let kept = 0;
  for (const [path, item] of Object.entries(spec.paths || {})) {
    const keptItem = {};
    let isLogPath = false;
    for (const [method, op] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !op || !ALLOW.has(op.operationId)) continue;
      const meta = META[op.operationId];
      if (meta?.log) {
        keptItem[method] = buildLogOperation(spec, op, item, meta, claimed);
        isLogPath = true;
      } else {
        if (meta) {
          // Partner copy always wins over upstream text.
          op.summary = meta.summary;
          op.description = meta.description;
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
      }
      kept++;
    }
    if (!Object.keys(keptItem).length) continue;
    // Path-level keys (shared parameters etc.) ride along, except on a log
    // path, whose operations were rebuilt with everything they need.
    if (!isLogPath) {
      for (const [key, value] of Object.entries(item)) if (!HTTP_METHODS.has(key.toLowerCase())) keptItem[key] = value;
    }
    keptPaths[path] = keptItem;
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
    components: pruneComponents(keptPaths, spec.components, spec.security),
    security: spec.security,
  };

  downConvert(out);
  guard(out);

  publish(JSON.stringify(out, null, 2) + '\n');
  console.log(
    `[sync-openapi] ${DRY_RUN ? 'dry run, nothing written' : `wrote ${OUT} (+ ${STATIC_OUT})`}: ` +
    `${kept} operations across ${tags.length} tags`
  );
}

main().catch((err) => {
  console.error(`[sync-openapi] ERROR: ${err.message}`);
  process.exit(1);
});
