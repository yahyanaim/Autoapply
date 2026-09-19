# Early-beta registrations

The dashboard landing page accepts registrations at `POST /api/early-users`.
It validates a deliberately small, consent-based form and writes only the
following columns to Google Sheets when the server-only configuration is
available:

```text
createdAt
firstName
email
country
jobSearchStatus
preferredLanguage
targetRole
heardAbout
mainProblem
consent
source
status
```

The form never accepts CVs, resume text, cover letters, credentials, payment
details, or API keys. It normalizes email addresses to lowercase, rejects a
honeypot field, uses an opaque idempotency key for safe client retries, and
uses email as the durable duplicate check. The public response intentionally
does not disclose whether an address was already registered.

## Staging setup required before enabling storage

1. Create a staging Google Sheet, not a production sheet, with the columns
   above in row one and in the exact order shown.
2. Create a dedicated Google service account and share only that one sheet with
   its email address. Give it the minimum editor permission required to append
   early-beta rows. Do not grant domain-wide delegation or access to other
   sheets.
3. Store these values only in the server environment for the dashboard project:

   ```text
   EARLY_USERS_SHEET_ID=
   GOOGLE_SERVICE_ACCOUNT_EMAIL=
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
   EARLY_USERS_SHEET_NAME=Early Users
   ```

4. Keep every value out of `NEXT_PUBLIC_*` variables, browser bundles, source
   files, logs, Sentry events, and Git. If the private key is injected as a
   single line, preserve its newlines using `\n`.
5. Submit synthetic staging data and verify the API returns the generic success
   response, timestamps are UTC, the email is lowercase, and a repeat request
   does not add a second row.
6. Enable the configuration only after that staging verification is approved.

When configuration is absent or the sheet header does not match, the endpoint
returns a generic temporary error and writes nothing. Automated tests use a
mock store; they never contact Google, Sentry, the production API, or a real
spreadsheet.

## Operational limits

Google Sheets has no unique constraint or transactional compare-and-append
operation. The route coalesces concurrent same-key requests in a warm runtime,
and the adapter checks normalized email before append to cover retries and cold
starts. For strict cross-instance deduplication at higher traffic, put a
durable uniqueness claim in front of the sheet before enabling public traffic.
