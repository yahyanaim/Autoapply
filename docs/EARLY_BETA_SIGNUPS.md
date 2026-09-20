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

Use a dedicated staging Google Cloud project, service account, and spreadsheet.
Do not use a personal account, a production service account, or a spreadsheet
that contains other data.

### 1. Create the staging sheet

1. Create a Google Sheet for staging only.
2. Name the tab `Early Users`, or choose another permitted tab name and set
   `EARLY_USERS_SHEET_NAME` to that exact name.
3. Put the twelve columns shown above in row one, in the exact order shown.
   The route rejects a sheet with a missing, reordered, or altered header.

### 2. Create a dedicated Google service account

1. In the dedicated staging Google Cloud project, create a service account for
   Early Beta registrations only.
2. Enable the Google Sheets API for that project.
3. Create a service-account key only when deployment configuration is ready.
   Treat the downloaded key file as a secret: never commit it, paste it into
   chat, upload it to the sheet, or use it in browser code.
4. Copy only the service-account email and private key into the Dashboard's
   server-side environment configuration. Delete any temporary local key copy
   according to the team's secret-handling policy.
5. Share only the staging Sheet with that service-account email. Give it the
   minimum editor permission required to append rows. Do not grant domain-wide
   delegation, project-owner access, or access to other sheets.

### 3. Configure the Dashboard server environment

Store these values only in the server environment for the Dashboard project:

```text
EARLY_USERS_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
EARLY_USERS_SHEET_NAME=Early Users
```

In Vercel, add them through the Dashboard project's environment-variable
settings for the approved staging environment. Do not prefix any of them with
`NEXT_PUBLIC_`; that prefix would expose a value to browser code. Do not add a
real value to `.env.example`, a committed `.env` file, or a build argument.

The private key may be stored as multiline text, or with literal `\n` escape
sequences when the environment editor requires a single line. The server
normalizes literal `\n` sequences to newlines before signing the Google
service-account assertion. Never log or display the value to diagnose a
configuration problem.

### 4. Redeploy and test with synthetic data

After the server-only variables are saved and the change is approved, redeploy
the Dashboard through the normal Vercel integration or the project's approved
redeploy workflow. A new deployment is required for the server route to receive
the new environment values.

Use synthetic staging data only:

```text
First name: Beta Test
Email: beta-test@example.test
Country: Morocco
Current job-search: Actively searching
Preferred language: English
Consent: true
```

Verify that the route returns its generic success response and that the row in
the staging Sheet has a UTC `createdAt`, a lowercase email, the expected twelve
columns, and no unexpected fields. Repeat the same submission to verify that a
normal retry does not append an uncontrolled duplicate. Do not use a real
candidate's details for this check.

### 5. Export to Microsoft Excel

Google Sheets remains the serverless source of storage. When an operator needs
an Excel file, use the Sheet's export/download action and choose Microsoft
Excel (`.xlsx`). Do not add filesystem-based spreadsheet storage to the
Dashboard; it would not be persistent in a serverless deployment.

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
