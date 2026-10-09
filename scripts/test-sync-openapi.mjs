// Tests for scripts/sync-openapi.mjs: the rebuild of the log endpoints and the
// guard that stops upstream text the public site must not carry from being
// published.
//
// Every case runs the real script in a child process against a spec crafted
// in memory, writing into a temporary directory, then checks the exit code
// and, for runs that must pass, the content of what was written. Fixture text
// is deliberately neutral.
//
// Run: npm run test:sync

import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const SNAPSHOT = 'openapi/kiss-api.json';
const LOCK_LOGS = '/locks/{lock}/logs';
const ENTRY_LOGS = '/entry-points/{entryPoint}/logs';
const RAW = 'raw upstream text';
const UPSTREAM_LOCK_SCHEMA = 'App.Http.Requests.Api.V2.Locks.StoreLockLogRequest';

const root = mkdtempSync(join(tmpdir(), 'sync-openapi-test-'));
let failures = 0;
let n = 0;

/**
 * A spec shaped like the live upstream one, rebuilt from the committed
 * snapshot: OpenAPI 3.1 nullable types, a server-class schema name and title,
 * maintainer descriptions on the log fields, the log responses as shared
 * $refs, an unreferenced component, and no summaries or descriptions.
 */
function upstreamLike() {
  const spec = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  spec.openapi = '3.1.0';
  const toUpstreamTypes = (node) => {
    if (Array.isArray(node)) return node.forEach(toUpstreamTypes);
    if (!node || typeof node !== 'object') return;
    if (node.nullable === true && typeof node.type === 'string') {
      node.type = [node.type, 'null'];
      delete node.nullable;
    }
    Object.values(node).forEach(toUpstreamTypes);
  };
  toUpstreamTypes(spec);

  const schemas = spec.components.schemas;
  schemas[UPSTREAM_LOCK_SCHEMA] = {...schemas.StoreLockLogRequest, title: UPSTREAM_LOCK_SCHEMA};
  delete schemas.StoreLockLogRequest;
  spec.paths[LOCK_LOGS].post.requestBody.content['application/json'].schema.$ref = `#/components/schemas/${UPSTREAM_LOCK_SCHEMA}`;
  for (const name of [UPSTREAM_LOCK_SCHEMA, 'StoreEntryPointLogRequest']) {
    for (const prop of Object.values(schemas[name].properties)) prop.description = `KEEP-1: ${RAW}`;
  }
  schemas.StoreEntryPointLogRequest.properties.zone_id = {type: ['string', 'null'], description: `KEEP-2: ${RAW}`};

  spec.components.responses = {
    ...spec.components.responses,
    AuthorizationException: {description: 'Authorization error'},
    NotFoundHttpException: {description: `KEEP-3: ${RAW}`},
  };
  for (const path of [LOCK_LOGS, ENTRY_LOGS]) {
    const op = spec.paths[path].post;
    op.responses = {
      201: {description: '', content: {'application/json': {schema: {type: 'object'}}}},
      401: {$ref: '#/components/responses/AuthenticationException'},
      403: {$ref: '#/components/responses/AuthorizationException'},
      404: {$ref: '#/components/responses/ModelNotFoundException'},
      422: {$ref: '#/components/responses/ValidationException'},
    };
    op.parameters[0].description = 'The ulid';
  }
  for (const item of Object.values(spec.paths)) {
    for (const op of Object.values(item)) {
      if (op && typeof op === 'object' && op.operationId) {
        delete op.summary;
        delete op.description;
      }
    }
  }
  return spec;
}

const bodyName = (spec, path) => spec.paths[path].post.requestBody.content['application/json'].schema.$ref.split('/').pop();
const body = (spec, path) => spec.components.schemas[bodyName(spec, path)];
const nonLogSchema = (spec) => spec.components.schemas.UnitResource ?? spec.components.schemas[Object.keys(spec.components.schemas).find((k) => /Unit/.test(k))];

/** Run the sync in its own directory; returns the result plus whatever it wrote. */
function sync({spec, source, env = {}, setup}) {
  const dir = join(root, String(++n));
  mkdirSync(dir, {recursive: true});
  if (spec) {
    source = join(dir, 'source.json');
    writeFileSync(source, JSON.stringify(spec));
  }
  if (setup) setup(dir);
  const result = spawnSync(process.execPath, ['scripts/sync-openapi.mjs'], {
    env: {...process.env, OPENAPI_OUT_DIR: dir, OPENAPI_NO_FALLBACK: '1', ...(source ? {OPENAPI_SOURCE: source} : {}), ...env},
    encoding: 'utf8',
  });
  const outFile = join(dir, 'openapi/kiss-api.json');
  const staticFile = join(dir, 'static/openapi/kiss-api.json');
  const text = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
  const staticText = existsSync(staticFile) ? readFileSync(staticFile, 'utf8') : null;
  return {...result, text, staticText, out: text ? JSON.parse(text) : null};
}

function record(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`);
}

function errorOf(result) {
  const lines = (result.stderr || '').split('\n');
  const at = lines.findIndex((l) => l.includes('ERROR'));
  return at < 0 ? '' : lines.slice(at, at + 2).join(' ').replace(/\s+/g, ' ').slice(0, 200);
}

/** Must exit non-zero. */
function mustFail(name, mutate, opts = {}) {
  const spec = upstreamLike();
  mutate?.(spec);
  const r = sync({spec, ...opts});
  record(name, r.status !== 0, r.status !== 0 ? errorOf(r) : 'exited 0');
}

/** Must exit 0, write identical spec and static files, and satisfy `check(out, text)`. */
function mustPass(name, mutate, check = () => true, opts = {}) {
  const spec = opts.source ? undefined : upstreamLike();
  if (spec) mutate?.(spec);
  const r = sync({spec, ...opts});
  if (r.status !== 0) return record(name, false, `exit ${r.status}: ${errorOf(r)}`);
  if (r.text === null || r.text !== r.staticText) return record(name, false, 'spec and static download differ');
  let verdict;
  try { verdict = check(r.out, r.text); } catch (e) { verdict = e.message; }
  record(name, verdict === true, verdict === true ? '' : String(verdict));
}

const lacks = (text, ...needles) => {
  const hit = needles.find((s) => text.includes(s));
  return hit ? `output still contains ${JSON.stringify(hit)}` : true;
};

// --- structural failures ----------------------------------------------------

mustFail('renamed body field', (s) => {
  const b = body(s, LOCK_LOGS);
  b.properties.scanned_serial = b.properties.scanned_lock_serial;
  delete b.properties.scanned_lock_serial;
});
mustFail('renamed path parameter', (s) => { s.paths[LOCK_LOGS].post.parameters[0].name = 'lockUlid'; });
mustFail('body switched from $ref to inline', (s) => {
  const media = s.paths[LOCK_LOGS].post.requestBody.content['application/json'];
  media.schema = structuredClone(body(s, LOCK_LOGS));
});
mustFail('two log endpoints share one body schema', (s) => {
  s.paths[ENTRY_LOGS].post.requestBody.content['application/json'].schema.$ref = `#/components/schemas/${UPSTREAM_LOCK_SCHEMA}`;
});
mustFail('body schema missing', (s) => { delete s.components.schemas[UPSTREAM_LOCK_SCHEMA]; });
mustFail('listed field now uses allOf', (s) => {
  body(s, LOCK_LOGS).properties.reason = {allOf: [{type: 'string', description: RAW}]};
});
mustFail('listed field now has items', (s) => {
  body(s, ENTRY_LOGS).properties.package = {type: 'array', items: {type: 'string', description: RAW}};
});

// --- leaked text the guard must catch (outside the rebuilt log endpoints) ---

const inUnitSchema = (text) => (s) => { nonLogSchema(s).description = text; };
mustFail('ticket number', inUnitSchema('see KEEP-7'));
mustFail('ticket number with a space', inUnitSchema('see KEEP 7'));
mustFail('ticket number with an en dash', inUnitSchema('see KEEP–7'));
mustFail('ticket number with a zero-width space', inUnitSchema('see KE​EP-7'));
mustFail('fullwidth ticket number', inUnitSchema('see ＫＥＥＰ-7'));
mustFail('internal package name, hyphenated', inUnitSchema('mirrors kiss-core'));
mustFail('backslash namespace', inUnitSchema('see App\\Models\\Unit'));
mustFail('dotted class path', inUnitSchema('see Foo.Bar.Baz'));
mustFail('chip name with a space', inUnitSchema('works with ST 25 tags'));
mustFail('issue tracker URL', inUnitSchema('see https://linear.app/team/issue/ABC-1'));
mustFail('internal repository URL', inUnitSchema('see https://github.com/Keep-it-Simple-Storage/kiss-api/pull/1'));
mustFail('extension key with leaked text', (s) => { nonLogSchema(s)['x-note'] = 'KEEP-8'; });
mustFail('leaked text in a key', (s) => { nonLogSchema(s).properties['kiss_core_field'] = {type: 'string'}; });
mustFail('response schema text on another endpoint', (s) => {
  s.paths['/health'].get.responses['200'].description = 'tapt_nfc';
});
mustFail('leaked text in a path-level parameter', (s) => {
  s.paths['/units'].parameters = [{name: 'x', in: 'query', description: 'KEEP-9', schema: {type: 'string'}}];
});
mustFail('dotted component name that collides once shortened', (s) => {
  s.components.responses['Foo.Bar.ValidationException'] = {description: 'x'};
  s.paths['/health'].get.responses['503'] = {$ref: '#/components/responses/Foo.Bar.ValidationException'};
});

// --- evasions the normalisation must see through ----------------------------

for (const [name, text] of [
  ['standard number with a slash', 'ISO/IEC 15693 tags'],
  ['chip name with a space', 'NAC 1080 locks'],
  ['chip name with a hyphen', 'ST-25DV tags'],
  ['markdown-escaped package name', 'mirrors kiss\\_core'],
  ['HTML-entity hyphen', 'see KEEP&#45;7'],
  ['hex HTML-entity hyphen', 'see KEEP&#x2d;7'],
  ['named HTML-entity hyphen', 'see KEEP&hyphen;7'],
  ['hash separator', 'see KEEP#7'],
  ['colon separator', 'see KEEP:7'],
  ['ticket number glued to a word', 'see amine_KEEP-7'],
  ['server path', 'see app/Http/Controllers/Foo'],
  ['static call', 'see Thing::store'],
  ['Greek look-alike letters', 'see ΚΕΕΡ-7'],
  ['Cyrillic look-alike letters', 'see КЕЕР-7'],
]) mustFail(name, inUnitSchema(text));

// --- withheld fields as keys on any operation ---------------------------------

mustFail('withheld fields in another endpoint\'s response', (s) => {
  const content = s.paths['/access-logs'].get.responses['200'].content['application/json'];
  content.schema = {type: 'object', properties: {battery_mv: {type: 'integer'}, lock_fw_version: {type: 'integer'}}};
});
mustFail('outcome key in another endpoint\'s response', (s) => {
  s.paths['/access-logs'].get.responses['200'].content['application/json'].schema = {type: 'object', properties: {outcome: {type: 'string'}}};
});
mustFail('withheld field as another endpoint\'s query parameter', (s) => {
  s.paths['/access-logs'].get.parameters.push({name: 'battery_mv', in: 'query', schema: {type: 'integer'}});
});
mustPass('outcome stays legitimate on the unit sync', undefined, (out, text) => text.includes('"outcome"') || 'unit sync outcome missing');

// --- keyword values on rebuilt log fields -------------------------------------

mustFail('prose in a field format', (s) => { body(s, LOCK_LOGS).properties.reason.format = RAW; });
mustFail('unknown field type', (s) => { body(s, LOCK_LOGS).properties.reason.type = RAW; });
mustFail('non-numeric length', (s) => { body(s, LOCK_LOGS).properties.reason.maxLength = RAW; });
mustFail('non-boolean nullable', (s) => { body(s, LOCK_LOGS).properties.reason.nullable = RAW; });
mustPass('log tags pinned and security scopes dropped', (s) => {
  Object.assign(s.paths[LOCK_LOGS].post, {tags: ['Internal'], security: [{scheme: ['write:everything']}]});
}, (out, text) => {
  const op = out.paths[LOCK_LOGS].post;
  if (JSON.stringify(op.tags) !== '["Logs"]') return `tags ${JSON.stringify(op.tags)}`;
  if (JSON.stringify(op.security) !== '[{"scheme":[]}]') return `security ${JSON.stringify(op.security)}`;
  return lacks(text, 'Internal', 'write:everything');
});

// --- upstream text on the log endpoints is replaced, not published -----------

mustPass('upstream-shaped spec', undefined, (out, text) => {
  if (!out.components.schemas.StoreLockLogRequest) return 'StoreLockLogRequest missing';
  if (out.components.responses?.NotFoundHttpException) return 'unreferenced response not pruned';
  if (out.components.responses?.AuthorizationException) return 'response only the log endpoints used not pruned';
  const props = out.components.schemas.StoreLockLogRequest.properties;
  if (!props.scanned_lock_serial.description.includes('session.lockId')) return 'partner copy not applied';
  if (props.reason.nullable !== true || props.reason.type !== 'string') return 'type keywords not kept';
  if (out.paths[LOCK_LOGS].post.summary !== 'Report lock activity') return 'summary not from META';
  if ('zone_id' in out.components.schemas.StoreEntryPointLogRequest.properties) return 'zone_id published';
  return lacks(text, 'App.', RAW, 'The ulid');
});
mustPass('upstream description on a log operation', (s) => {
  Object.assign(s.paths[LOCK_LOGS].post, {summary: RAW, description: `Send outcome too. ${RAW}`});
}, (out, text) => out.paths[LOCK_LOGS].post.description.startsWith('Record a lock event') || lacks(text, RAW));
mustPass('upstream description on another operation', (s) => {
  s.paths['/health'].get.description = RAW;
}, (out, text) => lacks(text, RAW));
mustPass('prose on the log body, its fields and its request', (s) => {
  const op = s.paths[LOCK_LOGS].post;
  op.requestBody.description = `Send outcome as well. ${RAW}`;
  const b = body(s, LOCK_LOGS);
  b.description = RAW;
  b.properties.reason.title = RAW;
  b.properties.reason.example = RAW;
  b.properties.platform.enum.push('other');
  b.example = {key: 'lock.open_successful', outcome: 'confirmed'};
}, (out, text) => (out.components.schemas.StoreLockLogRequest.properties.platform.enum.length === 2 || 'unapproved enum value published') && lacks(text, RAW, 'Send outcome', '"other"'));
mustPass('extension keys on a log endpoint', (s) => {
  s.paths[LOCK_LOGS].post['x-internal'] = RAW;
  s.paths[LOCK_LOGS]['x-internal'] = RAW;
  body(s, LOCK_LOGS)['x-internal'] = RAW;
  body(s, LOCK_LOGS).properties.key['x-internal'] = RAW;
}, (out, text) => lacks(text, 'x-internal', RAW));
mustPass('extra media type on a log body', (s) => {
  s.paths[LOCK_LOGS].post.requestBody.content['application/x-www-form-urlencoded'] = {schema: {type: 'object', description: RAW}};
}, (out, text) => lacks(text, 'x-www-form-urlencoded', RAW));
mustPass('response and header text on a log endpoint', (s) => {
  s.paths[LOCK_LOGS].post.responses['201'] = {
    description: RAW,
    headers: {'X-Debug': {description: RAW, schema: {type: 'string'}}},
    content: {'application/json': {schema: {type: 'object', properties: {lock_fw_version: {type: 'integer'}}}}},
  };
}, (out, text) => lacks(text, RAW, 'X-Debug', 'lock_fw_version'));
mustPass('withheld fields added to both log bodies', (s) => {
  for (const path of [LOCK_LOGS, ENTRY_LOGS]) {
    const b = body(s, path);
    Object.assign(b.properties, {
      outcome: {type: 'string', description: RAW},
      lock_fw_version: {type: 'integer'}, lock_fw_build: {type: 'integer'}, battery_mv: {type: 'integer'},
    });
    b.required = [...(b.required || []), 'outcome'];
  }
}, (out, text) => {
  const logText = JSON.stringify([out.paths[LOCK_LOGS], out.paths[ENTRY_LOGS],
    out.components.schemas.StoreLockLogRequest, out.components.schemas.StoreEntryPointLogRequest]);
  return lacks(logText, '"outcome"', 'lock_fw_', 'battery_mv') === true ? lacks(text, RAW) : lacks(logText, '"outcome"', 'lock_fw_', 'battery_mv');
});
mustPass('withheld field as a log endpoint parameter', (s) => {
  s.paths[LOCK_LOGS].post.parameters.push({name: 'lock_fw_version', in: 'query', schema: {type: 'integer'}});
  s.paths[ENTRY_LOGS].parameters = [{name: 'battery_mv', in: 'query', schema: {type: 'integer'}}];
}, (out, text) => lacks(text, 'lock_fw_', 'battery_mv'));
mustPass('dotted component names are shortened in every section', (s) => {
  for (const section of ['responses', 'parameters', 'headers', 'examples', 'requestBodies']) {
    s.components[section] = {...(s.components[section] || {}), [`Foo.Bar.Shared${section}`]: {description: 'shared'}};
  }
  const op = s.paths['/health'].get;
  op.responses['503'] = {$ref: '#/components/responses/Foo.Bar.Sharedresponses'};
  op.parameters = [{$ref: '#/components/parameters/Foo.Bar.Sharedparameters'}];
  op.requestBody = {$ref: '#/components/requestBodies/Foo.Bar.SharedrequestBodies'};
  op.responses['200'].headers = {'X-A': {$ref: '#/components/headers/Foo.Bar.Sharedheaders'}};
  op.responses['200'].content = {'application/json': {examples: {a: {$ref: '#/components/examples/Foo.Bar.Sharedexamples'}}}};
}, (out, text) => (out.components.parameters?.Sharedparameters && out.components.examples?.Sharedexamples
  && out.components.requestBodies?.SharedrequestBodies && out.components.headers?.Sharedheaders
  ? lacks(text, 'Foo.Bar') : 'a shortened component is missing'));
mustPass('unreferenced leaky components in every section', (s) => {
  for (const section of ['schemas', 'parameters', 'examples', 'requestBodies', 'headers', 'responses']) {
    s.components[section] = {...(s.components[section] || {}), 'App.Unused.Thing': {description: `KEEP-10 ${RAW}`}};
  }
}, (out, text) => lacks(text, 'Unused', RAW));

// --- the fallback branch ------------------------------------------------------

const UNREACHABLE = 'http://127.0.0.1:9/partner-api.json';
const seedCommitted = (tamperStatic, tamperSpec) => (dir) => {
  const clean = readFileSync(SNAPSHOT, 'utf8');
  for (const [file, tampered] of [['openapi/kiss-api.json', tamperSpec], ['static/openapi/kiss-api.json', tamperStatic]]) {
    mkdirSync(join(dir, file, '..'), {recursive: true});
    writeFileSync(join(dir, file), tampered ? clean.replace('"KISS API Reference"', '"KISS API Reference KEEP-11"') : clean);
  }
};
{
  const r = sync({source: UNREACHABLE, env: {OPENAPI_NO_FALLBACK: '0'}, setup: seedCommitted(true, false)});
  record('fallback with a tampered static download', r.status !== 0, r.status !== 0 ? errorOf(r) : 'exited 0');
}
{
  const r = sync({source: UNREACHABLE, env: {OPENAPI_NO_FALLBACK: '0'}, setup: seedCommitted(false, true)});
  record('fallback with a tampered committed spec', r.status !== 0, r.status !== 0 ? errorOf(r) : 'exited 0');
}
{
  const r = sync({source: UNREACHABLE, env: {OPENAPI_NO_FALLBACK: '0'}, setup: (dir) => {
    seedCommitted(false, false)(dir);
    writeFileSync(join(dir, 'static/openapi/kiss-api.json'), '{}\n'); // stale, but clean
  }});
  const ok = r.status === 0 && r.text === readFileSync(SNAPSHOT, 'utf8') && r.text === r.staticText;
  record('fallback rewrites a stale static download from the committed spec', ok, ok ? '' : `exit ${r.status} ${errorOf(r)}`);
}

// --- the real specs -------------------------------------------------------------

mustPass('committed snapshot reprocesses to itself', undefined, (out, text) =>
  text === readFileSync(SNAPSHOT, 'utf8') || 'output differs from the committed snapshot', {source: SNAPSHOT});
{
  const r = sync({});
  if (r.status !== 0 && /could not load/.test(r.stderr)) {
    // Offline: sync:api falls back to the committed snapshot, tested above.
    console.log(`skip live spec (unreachable): ${errorOf(r)}`);
  } else {
    record('live spec', r.status === 0 && r.text !== null && r.text === r.staticText, r.status === 0 ? '' : errorOf(r));
  }
}

rmSync(root, {recursive: true, force: true});
if (failures) {
  console.error(`\n${failures} sync test(s) failed`);
  process.exit(1);
}
console.log('\nall sync tests passed');
