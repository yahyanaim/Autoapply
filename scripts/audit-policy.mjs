import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const exception = Object.freeze({
  advisory: 'GHSA-vfj7-8cjw-p6xm',
  cve: 'CVE-2026-93687',
  owner: '@yahyanaim',
  expiresOn: '2026-11-03',
  upstream: 'https://github.com/micromatch/braces/issues/70',
});

const auditCommand =
  'node --test scripts/audit-policy.test.mjs && node scripts/audit-policy.mjs && pnpm audit --audit-level=low';

export function validateAuditPolicy(workspace, rootPackage, now = new Date()) {
  const auditSections = workspace.split(/^auditConfig:\s*$/m);
  if (auditSections.length !== 2) {
    throw new Error('Expected exactly one pnpm auditConfig section');
  }

  const auditSection = auditSections[1].split(/^[^\s#][^\n]*:/m, 1)[0].trim();
  const expectedSection = `ignoreGhsas:\n    - ${exception.advisory}`;
  if (auditSection !== expectedSection) {
    throw new Error('Only the approved GHSA may be ignored by pnpm audit');
  }

  if (rootPackage.scripts?.['audit:dependencies'] !== auditCommand) {
    throw new Error('The full-severity pnpm dependency audit must remain enabled');
  }

  if (Number.isNaN(now.getTime())) {
    throw new Error('The audit exception check requires a valid clock');
  }
  const expiresAt = Date.parse(`${exception.expiresOn}T23:59:59.999Z`);
  if (now.getTime() > expiresAt) {
    throw new Error(`${exception.advisory} risk acceptance expired on ${exception.expiresOn}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const workspace = readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');
  const rootPackage = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  try {
    validateAuditPolicy(workspace, rootPackage);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
