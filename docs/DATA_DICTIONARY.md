# ApplyAI data dictionary

The Prisma schema at `apps/api/src/database/prisma/schema.prisma` is the
authoritative machine-readable definition.

| Domain         | Main records                                             | Sensitivity and lifecycle                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `User`, `Profile`, `OAuthAccount`                        | Email/profile PII; OAuth tokens are never included in exports                                                                                                                                                 |
| Authentication | `Session`, `RefreshTokenHistory`, `ExtensionAuthHandoff` | Current and superseded refresh-token hashes, device/IP metadata, short-lived one-time handoffs; superseded history is retained across session logout/revocation until its absolute expiry, then lazily pruned |
| Resume         | `Resume`, `ResumeVersion`, `Skill`, `MatchScoreCache`    | Sensitive career history and derived score evidence; production objects use encrypted S3 storage                                                                                                              |
| Jobs           | `Job`, `Company`                                         | Public or partner-sourced job information                                                                                                                                                                     |
| Applications   | `Application`, `CoverLetter`                             | User activity, generated content, status timeline                                                                                                                                                             |
| Billing        | `Subscription`, `Payment`, `StripeWebhookEvent`          | Billing state and provider references; no card numbers stored                                                                                                                                                 |
| AI operations  | `AIRequest`, `UsageLimit`                                | Feature/provider/model, token/cost totals, request hash, quota counters                                                                                                                                       |
| Operations     | `ActivityLog`, `Notification`, `IdempotencyRecord`       | Security/business audit events, delivery state, and short-lived mutation replay records                                                                                                                       |

`User` deletion cascades owned database records. The erasure flow first cancels
an active Stripe subscription and deletes resume objects, then deletes the user.
Data exports select personal records explicitly and omit password hashes,
refresh-token hashes, OAuth tokens, encrypted MFA secrets, and handoff codes.

`RefreshTokenHistory.sessionId` is a logical session-family identifier, not a
foreign key. This is intentional: deleting a live `Session` must not erase the
short-lived evidence needed to recognize a later replay. `expiresAt` is the
hard detection boundary, `detectedAt` makes security alerts idempotent, and
refresh traffic opportunistically removes expired rows. Deleting the owning
`User` deletes all remaining history.

`MatchScoreCache` stores deterministic score output and evidence under hashed
resume, job, and scorer-version inputs. It does not retain another raw copy of
the job description and is deleted with its owning resume.

`IdempotencyRecord` stores a user-scoped operation name, client key, request
fingerprint, execution state, and the successful JSON response for a bounded
replay window. It contains no provider secret. Completed records expire after
24 hours; abandoned pending claims can be replaced after 15 minutes. Expired
records are pruned opportunistically, and deleting the owning `User` deletes the
records.
