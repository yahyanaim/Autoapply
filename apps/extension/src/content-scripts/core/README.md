# Core Content Script

The core content script is the entry point for all site-specific content scripts. It detects the current job board site, loads the appropriate adapter, and coordinates analysis and autofill operations.

## Architecture

```
content-scripts/
├── core/
│   ├── index.ts          # Entry point - detects site and loads adapter
│   └── README.md
├── adapters/
│   ├── types.ts          # JobPageAdapter interface
│   ├── base.adapter.ts   # Shared adapter utilities
│   ├── greenhouse/       # Greenhouse job board adapter
│   ├── lever/            # Lever job board adapter
│   ├── ashby/            # Ashby job board adapter
│   └── morocco/          # User-opened Moroccan job-board pages
└── overlay/
    ├── MatchScoreOverlay.tsx  # React overlay component
    └── inject-overlay.ts      # Shadow DOM injection
```

## Flow

1. Core index.ts runs on each supported job board page
2. It detects which adapter handles the current URL
3. Adapter's `detectJobPosting()` verifies it's a job page
4. Adapter extracts job data via `extractJobDescription()`
5. Job data is sent to background for analysis
6. Background returns match score
7. Overlay is injected via Shadow DOM
8. User can prepare one CV + cover-letter package
9. User reviews and approves it in the dashboard
10. Extension retrieves only the approved package and fills supported fields

## Message Types

- `TRIGGER_ANALYSIS` - Analyze the current posting and show the overlay
- `GET_MATCH_SCORE` - Analyze the current posting and return its score to the popup
- `PREPARE_APPLICATION` - Capture the job and generate the unified package
- `GET_APPROVED_PACKAGE` - Fetch the approved CV and cover letter for this URL

The extension can attach the approved PDF and insert the approved cover letter
when the target form exposes supported controls. It leaves unknown questions
untouched and never clicks a final submission control.

## Adapter Interface

All adapters implement `JobPageAdapter`:

```typescript
interface JobPageAdapter {
  name: string;
  canHandle(url: string): boolean;
  detectJobPosting(): boolean;
  extractJobDescription(): JobDescription | null;
  findFormFields(): FormField[];
  fillField(fieldId: string, value: string): boolean;
}
```
