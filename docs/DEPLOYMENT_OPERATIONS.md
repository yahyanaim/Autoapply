# Deployment and operations

## Environment separation

Use distinct projects, databases, Redis instances, storage buckets, Stripe
modes, provider budgets, and secrets for each environment:

| Environment | Trigger                                     | Data and credentials                                                                                            |
| ----------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Preview     | Vercel pull-request preview                 | Synthetic data and preview-only credentials                                                                     |
| Staging     | Explicit operator deployment                | Isolated staging services; never production data                                                                |
| Production  | Manual production workflow; run from `main` | Production services and environment-scoped secrets; GitHub Environment approval rules are configured externally |

The repository’s Vercel Git integration may own Preview and Production. The
AWS/EKS staging workflow is intentionally manual so a repository configured
only for Vercel no longer creates a failing AWS deployment on every `main`
push. Do not configure two systems to deploy the same environment.

## GitHub-to-AWS OIDC

The AWS workflows request `id-token: write` and use
`AWS_DEPLOY_ROLE_ARN`; they no longer accept an access-key ID or secret access
key. Create GitHub’s OIDC provider in AWS, then create separate least-privilege
roles for the `staging` and `production` GitHub environments.

Restrict each role trust policy to this repository and environment. The subject
claims are:

```text
repo:yahyanaim/Autoapply:environment:staging
repo:yahyanaim/Autoapply:environment:production
```

Store the matching role ARN as the environment-scoped
`AWS_DEPLOY_ROLE_ARN` GitHub secret. Grant only the ECR and EKS operations used
by the workflow. After one successful deployment, delete the obsolete
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` GitHub secrets.

## Deployment preflight

Before changing workloads, `infra/scripts/deploy.sh` verifies:

- the selected environment and deployment inputs;
- the Kubernetes `api-secrets` object;
- core database, Redis, auth, MFA, storage, and Stripe secrets;
- that `AI_PROVIDER` selects a supported provider with its matching API key;
- positive input/output token prices;
- credential-free HTTPS dashboard and Stripe return URLs;
- every configured CORS value is a credential-free HTTPS origin;
- Dahl credentials and an HTTPS provider URL when the Career Assistant is
  enabled;
- the environment’s TLS secret;
- successful database migration before rollout.

These configuration checks run before the migration job. NestJS repeats its
schema and cross-field validation when the new API starts.

## Health and monitoring

`GET /health` checks process liveness. `GET /health/ready` checks PostgreSQL,
Redis, and object storage. When the Career Assistant is enabled, its provider
health is reported separately without sending user content.

The repository defines the health signals and initial thresholds below. It does
not provision an alerting vendor, paging route, cloud budget alarm, or on-call
schedule. An operator must connect the hosting platform to these signals and
configure these minimum alerts:

| Signal             | Initial trigger                                        | Response                                           |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| Deployment         | Failed migration or rollout                            | Page release owner; stop promotion                 |
| API errors         | 5xx rate above 2% for 5 minutes                        | Inspect request IDs and dependency health          |
| Database           | Connection use above 80% or readiness failure          | Stop workers if necessary; inspect pool/exhaustion |
| Career/AI provider | Failure rate above 10% for 5 minutes or open circuit   | Disable provider/fail over; preserve cost limits   |
| AI spend           | Daily spend above the configured product budget        | Disable non-essential generation and investigate   |
| Queue              | Oldest resume job above 5 minutes or retained DLQ item | Follow the queue incident procedure                |

Alert routing, on-call destinations, and cloud-provider budget alarms remain
external environment configuration. Record the owner and test each route
quarterly; source review alone does not prove that an alert reaches a person.

## PostgreSQL backup and restore

Configure encrypted snapshots with the database provider. Separately, create a
portable logical backup:

```sh
DATABASE_URL='postgresql://…' \
BACKUP_DIRECTORY='/secure/applyai-backups' \
infra/scripts/backup-postgres.sh
```

Copy the dump and checksum to encrypted, access-controlled storage with a
retention policy. Never place them in the repository.

The repository does not schedule this command, upload its output, configure
provider snapshots, or enable bucket versioning. Those controls must be
configured and monitored in each production environment.

Test restoration against an empty, isolated database first:

```sh
RESTORE_DATABASE_URL='postgresql://…/applyai_restore_test' \
BACKUP_FILE='/secure/applyai-backups/applyai-YYYYMMDDTHHMMSSZ.dump' \
RESTORE_CONFIRMATION='restore:applyai_restore_test' \
infra/scripts/restore-postgres.sh
```

The restore script expects the companion file at `<backup-file>.sha256` and
refuses to run if that file is missing or malformed, or if its SHA-256 value
does not match the selected dump. It validates the dump format before asking
PostgreSQL to replace objects. Keep the dump and checksum together when moving
or renaming a backup.

After restore, run migrations, start a staging API, verify `/health/ready`,
authentication, one synthetic resume, and tenant isolation. Record the dump
timestamp, restore duration, verifier, result, and any corrective action.
A real restoration is an operational release gate and cannot be proven by the
source repository alone.
