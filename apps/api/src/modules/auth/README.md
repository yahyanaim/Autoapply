# Authentication

ApplyAI supports password and Google/GitHub authentication, authenticator MFA,
short-lived access tokens, and server-side refresh sessions.

Refresh tokens are single-use. Every successful rotation stores the superseded
token hash until the session family's absolute expiry. History is deliberately
retained if the live session is logged out or revoked, so a stolen older token
can still be recognized. The expiry timestamp is always enforced and expired
rows are lazily pruned during refresh traffic. User deletion still cascades the
history.

Reuse of a superseded token revokes that family, records one
`auth_token_reuse` activity, creates one in-app security notification, and also
sends one email when SMTP is configured. A persisted detection timestamp makes
repeated attempts with the same stolen token idempotent for auditing and
notifications.

Production MFA secrets are encrypted with the independent
`MFA_ENCRYPTION_KEY`; they never depend on `JWT_SECRET`. Generation, escrow,
recovery, and the deliberately manual versioned-rotation design are documented
in [`docs/MFA_KEY_OPERATIONS.md`](../../../../docs/MFA_KEY_OPERATIONS.md).
