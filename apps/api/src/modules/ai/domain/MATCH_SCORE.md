# Explainable original-CV match score

`calculateMatchScore()` compares the verified, parsed original CV with the job
title and description. It does not use generated CV text and does not call a
language model.

## What is evaluated

The engine normalizes English and French text, removes accents for comparison,
and resolves controlled aliases such as `PowerBI` → `Power BI`, `K8s` →
`Kubernetes`, and `anglais` → `English`. Exact term boundaries prevent matches
such as `Java` inside `JavaScript`.

It evaluates six categories:

| Category | Base weight | Evidence |
| --- | ---: | --- |
| Skills | 40% | Technical, business, engineering, and operational skills |
| Experience | 25% | Required years and role-title alignment |
| Responsibilities | 15% | Cross-language responsibility patterns and important terms |
| Education | 10% | Required degree level, including Moroccan `Bac+2/3/5` labels |
| Languages | 7% | Explicit English, French, Arabic, and other language requirements |
| Certifications | 3% | Explicit professional or cloud certification requirements |

If a job does not mention a category, that category is excluded and the
remaining weights are normalized. The absence of a certification requirement,
for example, never penalizes a candidate.

## Original-CV evidence

When the resume is structured JSON, employment periods are converted to month
ranges and overlapping jobs are counted once. This avoids turning two
simultaneous two-year roles into four years of experience. Plain-text CV input
is still supported through explicitly declared experience durations.

The engine never adds a skill because it appears only in the job offer. A term
is considered matched only when an alias exists in the original CV evidence.

## Requirement strength and safety caps

Terms near markers such as `required`, `mandatory`, `obligatoire`, or `requis`
receive more weight than terms near `preferred`, `bonus`, `souhaité`, or
`atout`.

The final score is capped when the CV misses several core skills, a mandatory
experience threshold, a mandatory degree, or every required language. This
prevents generic keyword overlap from hiding a hard qualification gap.

## Returned explanation

The result contains:

- overall score from 0–100;
- confidence from 0–100, based on available evidence;
- a score for every applicable category;
- verified matched terms;
- missing requirements ordered by importance;
- weak CV areas;
- readable evidence statements explaining the calculation.

The score is a decision-support signal, not a promise of an interview and not a
claim that it reproduces a particular employer's private ATS algorithm.

## Cache behavior

The backend hashes the resume content, job text, and algorithm version. An
identical comparison reuses the stored score without storing another copy of
the raw CV or job description. Changing either document or upgrading the
algorithm automatically produces a new cache key.
