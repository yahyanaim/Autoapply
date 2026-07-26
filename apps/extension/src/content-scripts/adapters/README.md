# Site Adapters

One folder per supported job site. Each adapter encapsulates site-specific DOM logic behind the `JobPageAdapter` interface.

## Supported Sites

- **greenhouse/** - Greenhouse Job Boards (boards.greenhouse.io)
- **lever/** - Lever Job Postings (*.lever.co)
- **ashby/** - Ashby Job Postings (jobs.ashbyhq.com)

## Creating a New Adapter

1. Create a new folder: `src/content-scripts/adapters/<site>/`
2. Create `adapter.ts` extending `BaseAdapter`
3. Implement the `JobPageAdapter` interface
4. Add URL pattern to `canHandle()`
5. Register adapter in `core/index.ts`

## Adapter Interface

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

## BaseAdapter Utilities

The `BaseAdapter` class provides:

- `querySelector<T>(selector)` - Type-safe querySelector
- `querySelectorAll<T>(selector)` - Type-safe querySelectorAll
- `waitForElement(selector, timeout)` - Wait for DOM element
- `sleep(ms)` - Async sleep
- `getElementText(element)` - Get trimmed text
- `setInputValue(element, value)` - Set value with React compatibility
- `setSelectValue(element, value)` - Set select value

## Best Practices

- Use the `BaseAdapter` helpers for DOM queries
- Always check `detectJobPosting()` before extraction
- Return `null` from `extractJobDescription()` if not a job page
- Handle missing elements gracefully
- Use native value setters for React forms
