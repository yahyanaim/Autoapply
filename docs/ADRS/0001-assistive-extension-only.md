# ADR 0001: assistive extension, no unattended submission

- Status: accepted
- Date: 2026-07-25

## Decision

The MVP extension may detect supported job pages, calculate match scores, and
fill supported fields. It never clicks the final submit control. Users must
review and submit each application themselves.

## Consequences

Site behavior stays behind adapter interfaces and host permissions remain
limited. Partner APIs may be evaluated later, but unattended job-site automation
requires explicit product and legal review.
