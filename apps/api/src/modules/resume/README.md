# resume

Spec section 7.3 -- parsing, structured JSON normalization, optimization,
fabrication-detection validation, and ATS-friendly CV generation.

## Generated CV flow

1. `POST /resumes/:id/optimize` sends the verified structured resume and target
   job to `resume-optimize.v2`.
2. The AI may rewrite the profile, experience descriptions, bullets, and project
   descriptions. It can only reorder the original skills.
3. `buildGeneratedResumeDocument` merges the rewritten copy with immutable
   employers, titles, dates, education, projects, and profile contact details.
4. Fabrication checks run before the generated document and plain-text version
   are stored on `ResumeVersion`.
5. `GET /resumes/:id/versions` restores previous generated versions.
6. `GET /resumes/:id/versions/:versionId/pdf` verifies tenant ownership and
   renders the selected version as a tagged, selectable-text A4 PDF.

The `classic-ats-v1` renderer uses a one-column serif layout with centered
contact details, uppercase section headings, thin rules, and right-aligned
dates. It intentionally avoids icons, images, text boxes, and multi-column
content that can reduce ATS compatibility.
