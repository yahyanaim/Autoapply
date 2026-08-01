# ai

Spec section 7 -- AIProvider port + implementations, prompt template versioning, per-feature use cases.

`POST /ai/optimize` and `POST /ai/cover-letter` require a 16–128 character
`Idempotency-Key`. Reuse the same key and identical payload after a timeout or
lost response; a conflicting or still-pending reuse returns `409`.
