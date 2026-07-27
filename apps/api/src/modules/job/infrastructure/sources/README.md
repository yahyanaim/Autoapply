# Job Sources

Official partner API adapters only, per Spec section 0/section 11:
greenhouse/ (Job Board API), lever/ (Postings API), ashby/ (public API).
Do not add a LinkedIn/Indeed adapter here -- those require DOM scraping,
which is out of scope without separate legal review.

CV discovery may refresh a bounded set of these sources through
`JOB_DISCOVERY_SOURCES`. Other sites remain user-initiated extension captures;
they are never fetched in bulk by the API.
