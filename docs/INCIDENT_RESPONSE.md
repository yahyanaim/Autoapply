# Incident response runbook

## First response

1. Open an incident channel, assign an incident commander, and record UTC time.
2. Classify impact: security/privacy, authentication, billing, AI provider,
   queue, database, or availability.
3. Preserve request IDs, activity logs, deployment SHA, provider status, and
   affected time range. Never paste tokens, passwords, resume text, or secrets
   into the incident channel.
4. Contain impact with the narrowest reversible action: disable a provider,
   stop a worker, revoke sessions, pause checkout, or roll back the deployment.
5. Post an internal update at a cadence chosen by severity until stable.

## Queue failures

- Inspect `resume-parse` depth, worker errors, and Redis health.
- Inspect `resume-parse-dead-letter`; each item includes the original job ID,
  payload identifiers, attempts, and terminal reason.
- Correct the cause before replay. Reuse the original idempotency key/job ID.
- Confirm the resume state and activity record after replay.

## AI provider outage

- Confirm circuit-breaker warnings by request ID and provider.
- Verify configured fallback keys and provider status.
- If all providers fail, keep circuits open and return controlled service
  unavailable responses; do not raise timeouts or remove cost ceilings.

## Stripe webhook failure

- Compare Stripe event IDs with `stripe_webhook_events`.
- Fix the handler, then request Stripe redelivery. The event ledger prevents
  duplicate application of a successful event.
- Reconcile the local subscription with Stripe after recovery.

## Security or privacy event

- Revoke affected sessions and rotate exposed credentials.
- For an `auth_token_reuse` event, preserve the activity record, confirm the
  affected session family was revoked, notify the account owner, and inspect
  recent active-device metadata without collecting token values.
- Preserve audit records and restrict access to the response team.
- Identify affected people/data and engage the privacy/security owner.
- The privacy owner determines notification obligations and deadlines with
  counsel; engineering must not guess jurisdictional requirements.

## Database recovery

- Follow `docs/DEPLOYMENT_OPERATIONS.md`; never restore directly over production
  as the first test.
- Keep the dump beside its `.sha256` companion. The restore script must
  successfully verify that checksum before `pg_restore` inspects or applies the
  dump.
- Restore into an isolated database. Passing the checksum and format checks
  proves file integrity, not that the recovery drill or application validation
  succeeded.
- Run migrations, readiness checks, authentication, a synthetic resume flow,
  and tenant-isolation verification before considering promotion.
- Record recovery-point age, recovery duration, operator, and validation result.

## Closeout

Document cause, timeline, detection gap, customer impact, recovery, and owners
for corrective actions. Every escaped software defect requires a regression
test before closure.
