import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { productionOrigin, verifyProductionSmoke, smokeSummary } from './verify-production-smoke.mjs';

const baseEnv = () => ({
  GITHUB_EVENT_NAME: 'deployment_status',
  PRODUCTION_DASHBOARD_URL: 'https://dashboard.example.test',
  PRODUCTION_NORI_API_URL: 'https://nori.example.test',
  PRODUCTION_PRODUCT_API_STATE: 'deferred',
});
const event = (service = 'Dashboard') => {
  const environment = service === 'Dashboard' ? 'Production – autoapply' : 'Production – autoapply-api';
  return {
    repository: { full_name: 'yahyanaim/Autoapply' },
    deployment: { id: 7236963598, sha: 'a'.repeat(40), environment,
      production_environment: false, transient_environment: false, creator: { login: 'vercel[bot]' } },
    deployment_status: { state: 'success', environment, creator: { login: 'vercel[bot]' },
      environment_url: 'https://autoapply-synthetic-yahyanaims-projects.vercel.app' },
  };
};
const html = () => new Response('<html>Fixture dashboard</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const ready = url => new URL(url).hostname === 'nori.example.test'
  ? json({ status: 'ready', mode: 'career-chat-standalone' })
  : json({ status: 'ready', dependencies: { database: 'ready', redis: 'ready', storage: 'ready' } });
function harness(reply = url => new URL(url).pathname === '/' ? html() : ready(url)) {
  const calls = [];
  return { calls, options: { retryDelayMs: 0, sleep: async () => {}, fetchImpl: async (url, init) => {
    calls.push(url);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert(init.signal instanceof AbortSignal);
    assert.equal(init.body, undefined);
    return reply(url, init);
  } } };
}
const result = (report, name) => report.results.find(item => item.service === name);

test('Dashboard event checks canonical Dashboard and Nori, explicitly deferring undeployed Product API', async () => {
  const h = harness();
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(report.ok, true);
  assert.deepEqual(h.calls, ['https://dashboard.example.test/', 'https://nori.example.test/health/ready']);
  assert.equal(result(report, 'Dashboard').state, 'PASSED');
  assert.equal(result(report, 'Nori').state, 'PASSED');
  assert.equal(result(report, 'Product API').state, 'DEFERRED');
  assert.equal(result(report, 'Product API').attempts, 0);
  assert.match(smokeSummary(report), /Product API \| DEFERRED/);
  assert.doesNotMatch(smokeSummary(report), /Product API \| PASSED/);
});

test('Nori production event is recognized independently even with Vercel production_environment=false', async () => {
  const h = harness();
  const report = await verifyProductionSmoke(event('Nori'), baseEnv(), h.options);
  assert.equal(report.service, 'Nori');
  assert.equal(report.ok, true);
  assert.equal(h.calls.length, 2);
});

test('Dashboard 500 retries only three times and does not suppress an independent Nori check', async () => {
  const h = harness(url => new URL(url).pathname === '/' ? new Response('private body', { status: 500 }) : ready(url));
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(report.ok, false);
  assert.equal(result(report, 'Dashboard').attempts, 3);
  assert.equal(result(report, 'Nori').state, 'PASSED');
  assert.equal(h.calls.length, 4);
});

for (const value of [undefined, '', 'not a URL', 'http://dashboard.example.test', 'https://user:password@dashboard.example.test',
  'https://dashboard.example.test/path', 'https://dashboard.example.test/?private=yes', 'https://dashboard.example.test/#fragment',
  'https://dashboard.example.test:444', 'https://127.0.0.1', 'https://2130706433', 'https://host.local', 'https://localhost',
  ' https://dashboard.example.test', 'https://dashboard.example.test\\@evil.example.test']) {
  test(`invalid Dashboard configuration fails safely (${String(value)})`, async () => {
    const h = harness();
    const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_DASHBOARD_URL: value }, h.options);
    assert.equal(report.ok, false);
    assert.equal(result(report, 'Dashboard').state, 'FAILED');
    assert.deepEqual(h.calls, ['https://nori.example.test/health/ready']);
    assert.doesNotMatch(smokeSummary(report), /password|private=yes/);
  });
}

for (const url of [undefined, '', 'malformed', 'http://dashboard.example.test', 'https://evil.example.test',
  'https://dashboard.example.test.evil.test', 'https://other-synthetic-yahyanaims-projects.vercel.app',
  'https://autoapply-synthetic-attacker.vercel.app', 'https://user:secret@dashboard.example.test', 'https://dashboard.example.test/health']) {
  test(`untrusted deployment origin is rejected without any probe (${String(url)})`, async () => {
    const h = harness();
    const input = event();
    input.deployment_status.environment_url = url;
    const report = await verifyProductionSmoke(input, baseEnv(), h.options);
    assert.equal(report.state, 'REJECTED');
    assert.equal(report.ok, false);
    assert.equal(h.calls.length, 0);
    assert.doesNotMatch(smokeSummary(report), /secret|attacker/);
  });
}

test('canonical environment URL and legacy target URL are supported; log URLs are never destinations', async () => {
  const input = event();
  input.deployment_status.environment_url = 'https://dashboard.example.test/';
  input.deployment_status.target_url = 'https://vercel.com/deployment/logs';
  let h = harness();
  assert.equal((await verifyProductionSmoke(input, baseEnv(), h.options)).ok, true);
  delete input.deployment_status.environment_url;
  input.deployment_status.target_url = 'https://autoapply-synthetic-yahyanaims-projects.vercel.app';
  h = harness();
  assert.equal((await verifyProductionSmoke(input, baseEnv(), h.options)).ok, true);
  assert(h.calls.every(url => url.includes('example.test')));
});

for (const invalid of [undefined, '', 'http://nori.example.test']) {
  test(`explicitly required Nori cannot silently skip (${String(invalid)})`, async () => {
    const h = harness();
    const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_NORI_API_URL: invalid }, h.options);
    assert.equal(report.ok, false);
    assert.equal(result(report, 'Nori').state, 'FAILED');
    assert.equal(result(report, 'Nori').attempts, 0);
  });
}

test('Nori HTTP 500 fails after bounded retries without exposing the response', async () => {
  const h = harness(url => url.includes('nori.') ? new Response('credential=synthetic-secret', { status: 500 }) : html());
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(report.ok, false);
  assert.equal(result(report, 'Nori').attempts, 3);
  assert.doesNotMatch(smokeSummary(report), /credential|synthetic-secret/);
});

test('enabled Product API requires its own readiness contract and distinct origin', async () => {
  const h = harness();
  const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_PRODUCT_API_STATE: 'enabled',
    PRODUCTION_API_URL: 'https://product.example.test' }, h.options);
  assert.equal(report.ok, true);
  assert.equal(result(report, 'Product API').state, 'PASSED');
  assert.deepEqual(h.calls, ['https://dashboard.example.test/', 'https://nori.example.test/health/ready', 'https://product.example.test/health/ready']);
});

for (const value of [undefined, '', 'invalid', 'http://product.example.test']) {
  test(`enabled Product API with no valid origin fails (${String(value)})`, async () => {
    const h = harness();
    const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_PRODUCT_API_STATE: 'enabled', PRODUCTION_API_URL: value }, h.options);
    assert.equal(report.ok, false);
    assert.equal(result(report, 'Product API').state, 'FAILED');
    assert.equal(result(report, 'Product API').attempts, 0);
  });
}

test('a URL cannot silently turn a deferred Product API into a passed or skipped check', async () => {
  const h = harness();
  const env = { ...baseEnv(), PRODUCTION_API_URL: 'https://product.example.test' };
  assert.equal(result(await verifyProductionSmoke(event(), env, h.options), 'Product API').state, 'FAILED');
  delete env.PRODUCTION_PRODUCT_API_STATE;
  assert.equal(result(await verifyProductionSmoke(event(), env, h.options), 'Product API').state, 'FAILED');
  env.PRODUCTION_PRODUCT_API_STATE = 'typo';
  assert.equal(result(await verifyProductionSmoke(event(), env, h.options), 'Product API').state, 'FAILED');
  assert(!h.calls.some(url => url.includes('product.')));
});

test('Nori supplied as Product API is rejected before calling that origin under either role', async () => {
  const h = harness();
  const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_PRODUCT_API_STATE: 'enabled',
    PRODUCTION_API_URL: 'https://nori.example.test/' }, h.options);
  assert.equal(report.ok, false);
  assert.equal(result(report, 'Nori').state, 'FAILED');
  assert.equal(result(report, 'Product API').state, 'FAILED');
  assert.deepEqual(h.calls, ['https://dashboard.example.test/']);
});

test('different URLs returning the wrong service contract cannot impersonate Product API or Nori', async () => {
  const h = harness(url => new URL(url).pathname === '/' ? html() : json({ status: 'ready', mode: 'career-chat-standalone' }));
  const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_PRODUCT_API_STATE: 'enabled', PRODUCTION_API_URL: 'https://product.example.test' }, h.options);
  assert.equal(report.ok, false);
  assert.equal(result(report, 'Product API').state, 'FAILED');
  const wrongNori = harness(url => new URL(url).pathname === '/' ? html() : json({ status: 'ready', dependencies: { database: 'ready', redis: 'ready', storage: 'ready' } }));
  assert.equal(result(await verifyProductionSmoke(event(), baseEnv(), wrongNori.options), 'Nori').state, 'FAILED');
});

test('configured Product API returning 503 cannot pass', async () => {
  const h = harness(url => url.includes('product.') ? new Response(null, { status: 503 }) : new URL(url).pathname === '/' ? html() : ready(url));
  const report = await verifyProductionSmoke(event(), { ...baseEnv(), PRODUCTION_PRODUCT_API_STATE: 'enabled', PRODUCTION_API_URL: 'https://product.example.test' }, h.options);
  assert.equal(report.ok, false);
  assert.equal(result(report, 'Product API').attempts, 3);
});

for (const environment of ['Preview – autoapply', 'Production – unrelated', 'Production', 'Production – autoapply-api-extra', 'toString', '__proto__']) {
  test(`unrelated deployment environment is ignored (${environment})`, async () => {
    const h = harness(); const input = event(); input.deployment.environment = environment;
    const report = await verifyProductionSmoke(input, baseEnv(), h.options);
    assert.equal(report.state, 'IGNORED'); assert.deepEqual(report.results, []); assert.equal(h.calls.length, 0);
  });
}

for (const mutate of [e => { e.deployment.creator.login = 'attacker'; }, e => { e.deployment_status.creator.login = 'attacker'; },
  e => { e.repository.full_name = 'other/repo'; }, e => { e.deployment_status.environment = 'Production – autoapply-api'; },
  e => { e.deployment.sha = 'invalid'; }, e => { e.deployment.id = -1; }, e => { e.deployment.transient_environment = true; }]) {
  test('relevant event with inconsistent or untrusted metadata is rejected before HTTP', async () => {
    const h = harness(); const input = event(); mutate(input);
    assert.equal((await verifyProductionSmoke(input, baseEnv(), h.options)).state, 'REJECTED');
    assert.equal(h.calls.length, 0);
  });
}

test('non-success events and non-deployment triggers make no health claim', async () => {
  for (const state of ['pending', 'failure', 'inactive']) {
    const h = harness(); const input = event(); input.deployment_status.state = state;
    assert.equal((await verifyProductionSmoke(input, baseEnv(), h.options)).state, 'IGNORED');
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal((await verifyProductionSmoke(event(), { ...baseEnv(), GITHUB_EVENT_NAME: 'pull_request' }, h.options)).state, 'IGNORED');
  assert.equal(h.calls.length, 0);
});

test('duplicate production events are idempotent read-only rechecks, not cached release claims', async () => {
  const h = harness();
  const first = await verifyProductionSmoke(event(), baseEnv(), h.options);
  const second = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.deepEqual(first, second); assert.equal(h.calls.length, 4);
  assert.match(smokeSummary(second), /Repeated events recheck health/);
});

for (const status of [201, 204, 301, 302, 307, 308, 401, 404, 429, 500]) {
  test(`unexpected HTTP status ${status} cannot pass or follow redirects`, async () => {
    const h = harness(() => new Response(null, { status, headers: { location: 'https://unrelated.example.test/private' } }));
    const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
    assert.equal(report.ok, false);
    assert.equal(result(report, 'Dashboard').attempts, status === 429 || status >= 500 ? 3 : 1);
    assert(h.calls.every(url => /https:\/\/(dashboard|nori)\.example\.test\//.test(url)));
  });
}

test('network failures retry at most three times and never leak error details', async () => {
  const h = harness(() => { throw new Error('synthetic-secret token private chat'); });
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(report.ok, false); assert.equal(h.calls.length, 6);
  assert.doesNotMatch(smokeSummary(report), /synthetic-secret|private chat|token/);
});

test('temporary server failure can recover within the limited retry budget', async () => {
  let attempts = 0;
  const h = harness(url => new URL(url).pathname !== '/' ? ready(url) : ++attempts < 3 ? new Response(null, { status: 503 }) : html());
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(report.ok, true); assert.equal(result(report, 'Dashboard').attempts, 3);
});

for (const body of ['not JSON', JSON.stringify({ status: 'ready', mode: 'career-chat-standalone', private: 'x'.repeat(8193) }), JSON.stringify({ status: 'not-ready' })]) {
  test('invalid, oversized or non-ready health response fails without exposing body content', async () => {
    const h = harness(url => new URL(url).pathname === '/' ? html() : new Response(body, { headers: { 'content-type': 'application/json' } }));
    const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
    assert.equal(result(report, 'Nori').state, 'FAILED');
    assert.doesNotMatch(smokeSummary(report), /private|not JSON|xxxx/);
  });
}

test('a 200 non-HTML Dashboard and a non-JSON readiness response fail', async () => {
  const h = harness(() => json({ status: 'ready' }));
  assert.equal(result(await verifyProductionSmoke(event(), baseEnv(), h.options), 'Dashboard').state, 'FAILED');
  const other = harness(() => html());
  assert.equal(result(await verifyProductionSmoke(event(), baseEnv(), other.options), 'Nori').state, 'FAILED');
});

test('early readiness content-type failure aborts its unread network body', async () => {
  const signals = [];
  const h = harness((url, init) => {
    signals.push(init.signal);
    return new URL(url).pathname === '/' ? html() : new Response(new ReadableStream(), { headers: { 'content-type': 'text/plain' } });
  });
  const report = await verifyProductionSmoke(event(), baseEnv(), h.options);
  assert.equal(result(report, 'Nori').state, 'FAILED');
  assert(signals.every(signal => signal.aborted));
});

test('real local HTTP transport enforces timeouts and never follows a redirect', async () => {
  let targetRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/target` }); res.end(); }
    else if (req.url === '/target') { targetRequests++; res.end('Must not be fetched'); }
    else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"status":');
      const timer = setTimeout(() => res.end('"ready"}'), 1000);
      req.on('close', () => clearTimeout(timer));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const report = await verifyProductionSmoke(event(), baseEnv(), { timeoutMs: 100, retryDelayMs: 0, sleep: async () => {},
      fetchImpl: (url, init) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init) });
    assert.equal(report.ok, false); assert.equal(targetRequests, 0);
    assert.equal(result(report, 'Dashboard').attempts, 1); assert.equal(result(report, 'Nori').attempts, 3);
    assert.match(result(report, 'Nori').detail, /timed out/);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('CLI malformed events fail with sanitized output, while unrelated events exit without health claims', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applyai-smoke-test-'));
  try {
    const path = join(directory, 'event.json');
    writeFileSync(path, 'private synthetic invalid JSON');
    const env = { ...process.env, GITHUB_EVENT_NAME: 'deployment_status', GITHUB_EVENT_PATH: path, GITHUB_STEP_SUMMARY: join(directory, 'summary.md') };
    const cli = new URL('./verify-production-smoke.mjs', import.meta.url);
    let run = spawnSync(process.execPath, [cli.pathname], { encoding: 'utf8', env });
    assert.equal(run.status, 1); assert.doesNotMatch(run.stdout + run.stderr, /private synthetic/);
    const input = event(); input.deployment.environment = 'Preview – autoapply'; writeFileSync(path, JSON.stringify(input));
    run = spawnSync(process.execPath, [cli.pathname], { encoding: 'utf8', env });
    assert.equal(run.status, 0); assert.match(run.stdout, /IGNORED/); assert.doesNotMatch(run.stdout, /\| PASSED/);
    assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8'), /no health claim/);
  } finally { rmSync(directory, { recursive: true }); }
});

test('workflow preserves read-only permissions, trusted checkout, event gates and explicit configuration wiring', () => {
  const workflow = readFileSync(new URL('../.github/workflows/verify-vercel-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /: write|secrets\.|--location|curl /);
  for (const name of ['PRODUCTION_DASHBOARD_URL', 'PRODUCTION_NORI_API_URL', 'PRODUCTION_API_URL']) {
    assert(workflow.includes(`${name}: \u0024{{ vars.${name} }}`));
  }
  assert(workflow.includes("vars.PRODUCTION_PRODUCT_API_STATE || 'deferred'"));
  assert.match(workflow, /ref: main\n          persist-credentials: false/);
  assert.match(workflow, /github\.event_name == 'deployment_status'/);
  assert.match(workflow, /github\.event\.deployment_status\.state == 'success'/);
  assert(workflow.includes("environment == 'Production – autoapply'"));
  assert(workflow.includes("environment == 'Production – autoapply-api'"));
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /run: node --test scripts\/verify-production-smoke\.test\.mjs/);
  assert.match(workflow, /run: node scripts\/verify-production-smoke\.mjs/);
});

test('origin normalization preserves an approved canonical origin only', () => {
  assert.equal(productionOrigin('https://DASHBOARD.example.test/'), 'https://dashboard.example.test');
  assert.equal(productionOrigin('https://dashboard.example.test'), 'https://dashboard.example.test');
});
