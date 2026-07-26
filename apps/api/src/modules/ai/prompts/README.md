# Prompt Templates

Versioned prompt files per feature — Spec section 7.2.

## Naming Convention

`<feature>.v<N>.md` — kebab-case feature name, semver suffix.

## Current Files

| File | Feature | Version | Variables |
|---|---|---|---|
| `match-score.v2.md` | ATS Match Scoring | v2 | `{{resume}}`, `{{jobDescription}}` |
| `resume-optimize.v2.md` | Resume Optimization | v2 | `{{resume}}`, `{{jobDescription}}` |
| `cover-letter.v2.md` | Cover Letter Generation | v2 | `{{resume}}`, `{{jobDescription}}`, `{{tone}}` |

## Versioning Rules

- Bump the version suffix on any meaningful prompt change.
- `AIRequest.promptVersion` logs which version produced which output.
- Keep the previous version file for 30 days after a new version ships (for regression comparison).
- Never modify a shipped version in place — always create a new version.

## Prompt Structure

Each v2 prompt follows a consistent structure:
1. **Role definition** — who the AI is acting as
2. **Task** — what to do
3. **Methodology/rules** — how to do it (weighted scoring, constraints, formatting)
4. **Hard constraints** — non-negotiable rules (no fabrication, exact dates, etc.)
5. **Output format** — strict JSON schema with field descriptions
6. **Input variables** — `{{placeholder}}` syntax, interpolated at runtime
