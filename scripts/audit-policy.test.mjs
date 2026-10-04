import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exception, validateAuditPolicy } from './audit-policy.mjs';

const workspace = readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');
const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

async function auditAgainstFixture(advisoryIds) {
  const advisories = Object.fromEntries(
    advisoryIds.map((id, index) => [
      String(index + 1),
      {
        github_advisory_id: id,
        cves: [id === exception.advisory ? exception.cve : 'CVE-2099-00001'],
        severity: 'high',
        title: 'Synthetic audit-policy fixture',
        module_name: 'synthetic-package',
        vulnerable_versions: '*',
        patched_versions: 'none',
        findings: [{ paths: ['synthetic-package'] }],
        url: 'https://example.test/advisory',
      },
    ]),
  );
  const report = {
    advisories,
    metadata: {
      vulnerabilities: {
        low: 0,
        moderate: 0,
        high: advisoryIds.length,
        critical: 0,
      },
    },
  };
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/-/npm/v1/security/audits/quick') {
      response.writeHead(404).end();
      return;
    }
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(report));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        'pnpm',
        [
          'audit',
          '--audit-level=low',
          '--json',
          `--registry=http://127.0.0.1:${server.address().port}/`,
        ],
        { cwd: repositoryRoot },
      );
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.once('error', reject);
      child.once('close', (exitCode) => resolve({ exitCode, output }));
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('accepts only the approved GHSA before its UTC expiry', () => {
  assert.equal(exception.cve, 'CVE-2026-93687');
  assert.doesNotThrow(() =>
    validateAuditPolicy(workspace, rootPackage, new Date('2026-11-03T23:59:59.999Z')),
  );
});

test('an unrelated high-severity advisory cannot be added to the ignore list', () => {
  const broadened = workspace.replace(
    `    - ${exception.advisory}`,
    `    - ${exception.advisory}\n    - GHSA-aaaa-bbbb-cccc`,
  );
  assert.throws(
    () => validateAuditPolicy(broadened, rootPackage, new Date('2026-10-04T00:00:00Z')),
    /Only the approved GHSA/,
  );
  assert.match(rootPackage.scripts['audit:dependencies'], /pnpm audit --audit-level=low$/);
});

test('native pnpm audit ignores only the approved GHSA', async () => {
  const approvedOnly = await auditAgainstFixture([exception.advisory]);
  assert.equal(approvedOnly.exitCode, 0, approvedOnly.output);

  const unrelatedHigh = await auditAgainstFixture([
    exception.advisory,
    'GHSA-aaaa-bbbb-cccc',
  ]);
  assert.equal(unrelatedHigh.exitCode, 1, unrelatedHigh.output);
  assert.match(unrelatedHigh.output, /GHSA-aaaa-bbbb-cccc/);
});

test('fails closed after 2026-11-03 UTC', () => {
  assert.throws(
    () => validateAuditPolicy(workspace, rootPackage, new Date('2026-11-04T00:00:00Z')),
    /risk acceptance expired/,
  );
});
