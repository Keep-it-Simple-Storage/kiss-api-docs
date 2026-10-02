// Tests for scripts/sync-openapi.mjs: the guards that stop upstream text the
// public site must not carry from being published.
//
// Each case runs the sync as a dry run (nothing is written) against a spec
// crafted from the committed snapshot, and checks the exit code. The last
// case runs it against the live spec, which must pass.
//
// Run: npm run test:sync

import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const SNAPSHOT = 'openapi/kiss-api.json';
const LOCK_LOGS = '/locks/{lock}/logs';
const ENTRY_LOGS = '/entry-points/{entryPoint}/logs';

const base = () => JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const bodyRef = (spec, path) => spec.paths[path].post.requestBody.content['application/json'].schema.$ref;
const bodySchema = (spec, path) => spec.components.schemas[bodyRef(spec, path).split('/').pop()];

const dir = mkdtempSync(join(tmpdir(), 'sync-openapi-test-'));
let failures = 0;

function run(source, env = {}) {
  return spawnSync(process.execPath, ['scripts/sync-openapi.mjs'], {
    env: {...process.env, OPENAPI_DRY_RUN: '1', OPENAPI_NO_FALLBACK: '1', ...env, ...(source ? {OPENAPI_SOURCE: source} : {})},
    encoding: 'utf8',
  });
}

function check(name, mutate, expectPass) {
  const spec = base();
  mutate(spec);
  const file = join(dir, `${name.replace(/\W+/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(spec));
  report(name, run(file), expectPass);
}

function report(name, result, expectPass) {
  const passed = result.status === 0;
  const ok = passed === expectPass;
  if (!ok) failures++;
  const lines = (result.stderr || '').split('\n');
  const at = lines.findIndex((l) => l.includes('ERROR'));
  const why = at < 0 ? '' : lines.slice(at, at + 2).join(' ').replace(/\s+/g, ' ').slice(0, 220);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${result.status}, expected ${expectPass ? '0' : 'non-zero'}) ${why}`);
}

// --- must fail -------------------------------------------------------------

check('renamed body field', (spec) => {
  const s = bodySchema(spec, LOCK_LOGS);
  s.properties.scanned_serial = s.properties.scanned_lock_serial;
  delete s.properties.scanned_lock_serial;
}, false);

check('renamed path parameter', (spec) => {
  spec.paths[LOCK_LOGS].post.parameters[0].name = 'lockUlid';
}, false);

check('body switched from $ref to inline', (spec) => {
  const media = spec.paths[LOCK_LOGS].post.requestBody.content['application/json'];
  media.schema = structuredClone(bodySchema(spec, LOCK_LOGS));
  media.schema.properties.package.description = 'KEEP-1: raw upstream text';
}, false);

check('two operations share one body schema', (spec) => {
  spec.paths[ENTRY_LOGS].post.requestBody.content['application/json'].schema.$ref = bodyRef(spec, LOCK_LOGS);
}, false);

check('body schema missing', (spec) => {
  delete spec.components.schemas[bodyRef(spec, LOCK_LOGS).split('/').pop()];
}, false);

check('withheld field as a parameter on a log endpoint', (spec) => {
  spec.paths[LOCK_LOGS].post.parameters.push({name: 'lock_fw_version', in: 'query', schema: {type: 'integer'}});
}, false);

check('withheld field as a path-level parameter', (spec) => {
  spec.paths[ENTRY_LOGS].parameters = [{name: 'battery_mv', in: 'query', schema: {type: 'integer'}}];
}, false);

check('ticket number in another endpoint', (spec) => {
  spec.paths['/health'].get.description = 'KEEP-4: raw upstream text';
}, false);

check('internal package name in a kept schema', (spec) => {
  const name = Object.keys(spec.components.schemas).find((n) => /Unit/.test(n));
  spec.components.schemas[name].description = 'mirrors kiss_core';
}, false);

// --- must pass, with the withheld fields dropped ----------------------------

check('withheld fields added to both log bodies (dropped, not published)', (spec) => {
  for (const path of [LOCK_LOGS, ENTRY_LOGS]) {
    const s = bodySchema(spec, path);
    s.properties.outcome = {type: 'string', description: 'KEEP-2: raw upstream text'};
    s.properties.lock_fw_version = {type: 'integer', description: 'KEEP-3: raw upstream text'};
    s.properties.lock_fw_build = {type: 'integer'};
    s.properties.battery_mv = {type: 'integer'};
    s.example = {key: 'lock.open_successful', outcome: 'confirmed', battery_mv: 4100};
  }
}, true);

check('unreferenced schema with a ticket number (pruned)', (spec) => {
  spec.components.schemas.InternalOnly = {type: 'object', description: 'KEEP-5: raw upstream text'};
}, true);

// --- the real spec -----------------------------------------------------------

report('committed snapshot', run(SNAPSHOT), true);
const live = run(null);
if (live.status !== 0 && /could not load/.test(live.stderr)) {
  // Offline: sync:api falls back to the committed snapshot, tested above.
  console.log(`skip live spec (unreachable): ${live.stderr.trim().split('\n').pop()}`);
} else {
  report('live spec', live, true);
}

rmSync(dir, {recursive: true, force: true});
if (failures) {
  console.error(`\n${failures} sync test(s) failed`);
  process.exit(1);
}
console.log('\nall sync tests passed');
