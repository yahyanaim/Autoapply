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
│   └── ashby/            # Ashby job board adapter
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
8. User can trigger autofill from overlay

## Message Types

- `TRIGGER_ANALYSIS` - Analyze the current posting and show the overlay
- `GET_MATCH_SCORE` - Analyze the current posting and return its score to the popup

The overlay requests `GET_AUTOFILL_PROFILE` from the background worker only after the
user chooses assistive autofill. It never submits an application.

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
