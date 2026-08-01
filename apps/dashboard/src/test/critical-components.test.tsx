import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoverLetterReview } from '@/components/applications/CoverLetterReview';
import { QuotaSummary } from '@/components/features/QuotaSummary';
import { JobMatchExplanation } from '@/components/jobs/JobMatchExplanation';
import { PlanCard } from '@/components/billing/PlanCard';
import { pricingPlans } from '@/lib/pricing';
import { renderView, RenderedView, setFormValue } from './render';

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe('critical review and plan components', () => {
  it('explains a match with evidence and missing keywords', () => {
    view = renderView(
      <JobMatchExplanation
        explanation={['Skills align strongly with this role.']}
        matchedResumeSkills={['TypeScript', 'React']}
        missingKeywords={['Kubernetes']}
      />,
    );

    expect(view.container.textContent).toContain('Why this score?');
    expect(view.container.textContent).toContain(
      'Skills align strongly with this role.',
    );
    expect(view.container.textContent).toContain('TypeScript, React');
    expect(view.container.textContent).toContain('Kubernetes');
  });

  it('renders the enforced monthly quota without hiding exhausted capacity', () => {
    view = renderView(
      <QuotaSummary
        quota={{
          aiRequestsUsed: 5,
          aiRequestsMax: 5,
          resumeOptimizationsUsed: 1,
          resumeOptimizationsMax: 1,
          resetAt: '2026-08-01T00:00:00.000Z',
        }}
      />,
    );

    expect(
      view.required<HTMLElement>('[aria-label="Monthly AI quota"]').textContent,
    ).toContain('5/5');
    expect(view.container.textContent).toContain('0 CV optimization remaining');
  });

  it('renders the public price and included quota features', () => {
    const free = pricingPlans.find((plan) => plan.name === 'Free');
    if (!free) throw new Error('Free plan is missing');

    view = renderView(
      <PlanCard
        plan={free}
        disabled={false}
        buttonLabel="Start free"
        onSelect={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain('$0');
    expect(view.container.textContent).toContain('5 AI requests per month');
    expect(view.container.textContent).toContain(
      '1 truthful CV optimization per month',
    );
  });

  it('lets the user review and edit the generated cover letter', () => {
    const onChange = vi.fn();
    view = renderView(
      <CoverLetterReview value="Dear hiring team" onChange={onChange} />,
    );

    const textarea = view.required<HTMLTextAreaElement>(
      '#application-cover-letter',
    );
    expect(textarea.value).toBe('Dear hiring team');
    setFormValue(textarea, 'Dear Atlas team');
    expect(onChange).toHaveBeenCalledWith('Dear Atlas team');
  });
});
