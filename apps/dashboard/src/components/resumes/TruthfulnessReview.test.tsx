import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TruthfulnessReview } from './TruthfulnessReview';
import type { TruthfulnessReport } from '@/lib/api/hooks/use-resumes';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderReport(report: TruthfulnessReport) {
  act(() => root.render(<TruthfulnessReview report={report} />));
}

describe('TruthfulnessReview', () => {
  it('shows questionable and blocked findings with the proposed wording', () => {
    renderReport({
      status: 'blocked',
      summary: {
        supported: 3,
        safe_rewording: 2,
        needs_confirmation: 1,
        unsupported_blocked: 1,
      },
      findings: [
        {
          classification: 'needs_confirmation',
          type: 'narrative',
          section: 'Profile summary',
          detail: 'Confirm the new strategic-leadership wording.',
          proposed: 'Strategic marketing leader',
        },
        {
          classification: 'unsupported_blocked',
          type: 'metric',
          section: 'Quantitative achievements',
          detail: 'Added quantitative claim not in the verified resume: "45%".',
          proposed: '45%',
        },
      ],
    });

    expect(container.textContent).toContain('Confirm this wording');
    expect(container.textContent).toContain('Strategic marketing leader');
    expect(container.textContent).toContain('Unsupported · blocked');
    expect(container.textContent).toContain('45%');
  });

  it('shows a clear pass state when every change is grounded', () => {
    renderReport({
      status: 'passed',
      summary: {
        supported: 4,
        safe_rewording: 2,
        needs_confirmation: 0,
        unsupported_blocked: 0,
      },
      findings: [],
    });

    expect(container.textContent).toContain('Grounded in your CV');
    expect(container.textContent).toContain(
      'No unsupported or questionable claims were found.',
    );
  });
});
