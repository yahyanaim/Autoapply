# ApplyAI data dictionary

The Prisma schema at `apps/api/src/database/prisma/schema.prisma` is the
authoritative machine-readable definition.

| Domain | Main records | Sensitivity and lifecycle |
|---|---|---|
| Identity | `User`, `Profile`, `OAuthAccount` | Email/profile PII; OAuth tokens are never included in exports |
| Authentication | `Session`, `ExtensionAuthHandoff` | Hashed refresh tokens, device/IP metadata, short-lived one-time handoffs |
| Resume | `Resume`, `ResumeVersion`, `Skill` | Sensitive career history; production objects use encrypted S3 storage |
| Jobs | `Job`, `Company` | Public or partner-sourced job information |
| Applications | `Application`, `CoverLetter` | User activity, generated content, status timeline |
| Billing | `Subscription`, `Payment`, `StripeWebhookEvent` | Billing state and provider references; no card numbers stored |
| AI operations | `AIRequest`, `UsageLimit` | Feature/provider/model, token/cost totals, request hash, quota counters |
| Operations | `ActivityLog`, `Notification` | Security/business audit events and delivery state |

`User` deletion cascades owned database records. The erasure flow first cancels
an active Stripe subscription and deletes resume objects, then deletes the user.
Data exports select personal records explicitly and omit password hashes,
refresh-token hashes, OAuth tokens, encrypted MFA secrets, and handoff codes.
