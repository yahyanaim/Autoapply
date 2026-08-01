# application-tracker

The application entity owns the complete preparation workflow: source job,
source resume, structured job analysis, optimized resume version, cover letter,
review state, approval hashes, submission status and timeline.

`POST /applications/prepare` orchestrates job analysis, grounded CV generation
and cover-letter generation as one package. Only `ready_to_submit` packages with
matching approval hashes are exposed to the extension.

Application creation, preparation, and regeneration require a 16–128 character
`Idempotency-Key`. A retry must keep the same key and payload. Completed
responses replay within the retention window; conflicting or pending reuse
returns `409`.
