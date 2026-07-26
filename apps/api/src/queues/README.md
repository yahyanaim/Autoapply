# Queues (BullMQ)

Spec section 6.3 -- one file per queue: resume-parse, resume-optimize, job-ingest,
autofill, notification. Every queue requires exponential backoff, max-attempt
dead-letter routing, and idempotency keys (Spec section 6.3, HQSE async discipline section 2.3).
