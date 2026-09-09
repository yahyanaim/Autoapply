# ApplyAI product overview

## Purpose

ApplyAI helps a candidate prepare stronger job applications without changing
their underlying experience. It is an assistive workflow, not an autonomous
job-application bot: the candidate reviews the materials, controls form
answers, and performs the final submission.

## Candidate journey

1. Upload a PDF or DOCX resume. The API parses it into a structured evidence
   record owned by that candidate.
2. Discover up to 20 current jobs from approved Greenhouse, Lever, and Ashby
   public APIs, or capture a page the candidate has opened with the extension.
3. Compare the **original** resume to a chosen job with an explainable,
   deterministic score. This step does not call an AI provider.
4. Prepare a connected package: job analysis, an evidence-checked optimized CV,
   and a tailored cover letter.
5. Review, edit, regenerate where permitted, and explicitly approve a fixed
   package version.
6. Use the extension to help fill the application. The user answers unknown
   fields and chooses whether to submit.
7. Track the application status, notes, and timeline in the dashboard.

## Product rules that protect quality

- Match scoring is based on the original parsed CV, not AI-improved wording.
- Generated CV and cover-letter content is checked against source evidence;
  unsupported claims are blocked or marked for confirmation.
- Public provider listings must be recently observed before they can be used in
  a new application action. A candidate's own extension capture stays private
  to that candidate.
- Free, Pro, and Premium limits are enforced by the backend with atomic usage
  reservations. UI visibility does not grant entitlement.
- The public Morocco Career Assistant (Nori) is independent from application
  AI: it receives no account, profile, CV, or application data.

## What ApplyAI does not claim

- It does not scrape arbitrary websites or promise full automated coverage of
  Moroccan boards without an approved feed, API, or provider permission.
- It does not guarantee an interview or a job offer.
- It does not automatically submit applications.

See [USE_CASES.md](USE_CASES.md) for detailed flows and
[PRODUCT_SPEC.md](PRODUCT_SPEC.md) for feature requirements.
