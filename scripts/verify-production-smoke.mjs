import { appendFileSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const environments = Object.freeze({
  'Production – autoapply': 'Dashboard',
  'Production – autoapply-api': 'Nori',
});
// Both observed Vercel projects use this generated-host family. The trusted
// deployment environment, NOT the URL prefix, identifies the service.
const generatedHost = /^autoapply-[a-z0-9]+-yahyanaims-projects\.vercel\.app$/;
const names = ['Dashboard', 'Nori', 'Product API'];
const failure = (service, detail, attempts = 0) => ({ service, state: 'FAILED', detail, attempts });

export function productionOrigin(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\\\s]/.test(value)) {
    throw new Error('Invalid origin');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.port ||
      isIP(url.hostname) || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal)$/.test(url.hostname)) {
    throw new Error('Invalid origin');
  }
  return url.origin;
}

function eventIdentity(event, eventName) {
  const deployment = event?.deployment;
  const status = event?.deployment_status;
  const service = Object.hasOwn(environments, deployment?.environment)
    ? environments[deployment.environment] : null;
  if (eventName !== 'deployment_status' || status?.state !== 'success' || !service) return null;
  if (event.repository?.full_name !== 'yahyanaim/Autoapply' ||
      deployment.creator?.login !== 'vercel[bot]' || status.creator?.login !== 'vercel[bot]' ||
      status.environment !== deployment.environment || deployment.transient_environment === true ||
      !/^[a-f0-9]{40}$/.test(deployment.sha || '') ||
      !Number.isSafeInteger(deployment.id) || deployment.id < 1) {
    throw new Error('Untrusted deployment metadata');
  }
  // Vercel's actual records set production_environment=false even for these
  // named Production environments; do not infer Preview/Production from it.
  return { service, sha: deployment.sha, id: deployment.id };
}

function configuredChecks(env) {
  const checks = names.map((service, index) => {
    const value = env[['PRODUCTION_DASHBOARD_URL', 'PRODUCTION_NORI_API_URL', 'PRODUCTION_API_URL'][index]];
    if (service === 'Product API') {
      const state = env.PRODUCTION_PRODUCT_API_STATE || 'deferred';
      if (!['deferred', 'enabled'].includes(state)) {
        return failure(service, 'PRODUCTION_PRODUCT_API_STATE must be deferred or enabled.');
      }
      if (state === 'deferred') {
        return value
          ? failure(service, 'Product API has a URL but is deferred; explicitly enable it or remove the URL.')
          : { service, state: 'DEFERRED', detail: 'Not deployed; no readiness claim.', attempts: 0 };
      }
    }
    try {
      return { service, origin: productionOrigin(value) };
    } catch {
      return failure(service, 'Configure a credential-free HTTPS production origin (no path, query, fragment or custom port).');
    }
  });
  for (const check of checks) {
    if (check.origin && checks.some(other => other !== check && other.origin === check.origin)) {
      Object.assign(check, failure(check.service, 'Services must use distinct origins; Nori is not Product API.'));
    }
  }
  return checks;
}

async function readinessJson(response) {
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('Invalid readiness');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Invalid readiness');
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) throw new Error('Invalid readiness');
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function probe(check, {
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 10_000,
  retryDelayMs = 1_000,
} = {}) {
  if (!names.includes(check.service)) throw new Error('Invalid service');
  const origin = productionOrigin(check.origin);
  // Test injection cannot accidentally unbound production execution.
  if (!(timeoutMs > 0 && timeoutMs <= 10_000 && retryDelayMs >= 0 && retryDelayMs <= 1_000)) {
    throw new Error('Invalid probe policy');
  }
  const path = check.service === 'Dashboard' ? '/' : '/health/ready';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let detail = 'Network request failed or timed out.';
    let retry = true;
    try {
      const response = await fetchImpl(`${origin}${path}`, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Accept: check.service === 'Dashboard' ? 'text/html' : 'application/json' },
      });
      if (response.status !== 200) {
        detail = `Unexpected HTTP status ${Number(response.status) || 0}; redirects are not followed.`;
        retry = response.status === 429 || response.status >= 500;
        await response.body?.cancel();
      } else if (check.service === 'Dashboard') {
        await response.body?.cancel();
        if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          return failure(check.service, 'Dashboard did not return HTML.', attempt);
        }
        return { service: check.service, state: 'PASSED', detail: 'Production origin returned HTTP 200 HTML.', attempts: attempt };
      } else {
        let data;
        try { data = await readinessJson(response); } catch {
          if (controller.signal.aborted) throw new Error('Timed out');
          return failure(check.service, 'Invalid or oversized readiness response.', attempt);
        }
        const valid = data?.status === 'ready' && (check.service === 'Nori'
          ? data.mode === 'career-chat-standalone'
          : data.mode !== 'career-chat-standalone' && ['database', 'redis', 'storage'].every(key => data.dependencies?.[key] === 'ready'));
        return valid
          ? { service: check.service, state: 'PASSED', detail: 'Expected service readiness contract returned HTTP 200.', attempts: attempt }
          : failure(check.service, 'Readiness does not match the expected service contract.', attempt);
      }
    } catch {
      // Never log provider bodies, URLs, credentials, or raw network errors.
    } finally {
      // Also close unread bodies after an early contract/content-type failure.
      controller.abort();
      clearTimeout(timer);
    }
    if (!retry || attempt === 3) return failure(check.service, detail, attempt);
    await sleep(retryDelayMs);
  }
}

export async function verifyProductionSmoke(event, env, options) {
  let identity;
  try { identity = eventIdentity(event, env.GITHUB_EVENT_NAME); } catch {
    return { state: 'REJECTED', ok: false, detail: 'Untrusted production deployment metadata; no requests made.', results: [] };
  }
  if (!identity) return { state: 'IGNORED', ok: true, detail: 'Not a relevant successful production deployment; no health claim.', results: [] };
  const checks = configuredChecks(env);
  try {
    // environment_url is the service URL; target_url can be a legacy/log URL.
    // Validate provenance, but never use an event URL as a network destination.
    const origin = productionOrigin(event.deployment_status.environment_url ?? event.deployment_status.target_url);
    const expected = checks.find(check => check.service === identity.service)?.origin;
    if (origin !== expected && !generatedHost.test(new URL(origin).hostname)) throw new Error('Unexpected origin');
  } catch {
    return { state: 'REJECTED', ok: false, detail: 'Unexpected deployment origin; no requests made.', results: [] };
  }
  const results = [];
  for (const check of checks) results.push(check.state ? check : await probe(check, options));
  return { state: 'CHECKED', ok: !results.some(check => check.state === 'FAILED'), ...identity, results };
}

export function smokeSummary(report) {
  return `## Production origin smoke verification\n\nEvent: ${report.state}${report.id ? ` · deployment ${report.id} · ${report.sha}` : ''}\n\n` +
    (report.detail ? `${report.detail}\n\n` : '') +
    '| Service | Result | Attempts | Evidence |\n| --- | --- | --- | --- |\n' +
    report.results.map(({ service, state, attempts, detail }) => `| ${service} | ${state} | ${attempts} | ${detail} |`).join('\n') +
    '\n\nRead-only origin probes, not proof of a served commit, authenticated Product API behavior, or successful AI inference. Repeated events recheck health; they do not create releases or reuse cached passes.\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    report = await verifyProductionSmoke(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), process.env);
  } catch {
    report = { state: 'REJECTED', ok: false, detail: 'Smoke verification could not run safely; no health claim.', results: [] };
  }
  const summary = smokeSummary(report);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exitCode = report.ok ? 0 : 1;
}
