import { afterEach, describe, expect, it } from 'vitest';
import { ClassicResumePreview } from '@/components/resumes/ClassicResumePreview';
import { MatchScore } from '@/components/ui/MatchScore';
import type { GeneratedResumeDocument } from '@/lib/api/hooks/use-resumes';
import { renderView, RenderedView } from './render';

const document: GeneratedResumeDocument = {
  template: 'classic-ats-v1',
  contact: {
    fullName: 'Sara Amrani',
    email: 'sara@example.com',
    phone: '+212600000000',
    location: 'Casablanca',
    linkedInUrl: 'https://linkedin.com/in/sara',
  },
  profile: 'Data analyst focused on transparent operational reporting.',
  experience: [
    {
      title: 'Data Analyst',
      company: 'Atlas Data',
      startDate: '2023',
      endDate: 'Present',
      description: 'Built monthly operational dashboards.',
      highlights: ['Automated recurring quality checks'],
    },
  ],
  education: [
    {
      degree: 'Master in Data Analytics',
      institution: 'Université Hassan II',
      startDate: '2021',
      endDate: '2023',
    },
  ],
  skills: ['SQL', 'Power BI'],
  projects: [],
  certifications: ['Microsoft Power BI Data Analyst'],
  languages: ['Arabic', 'French', 'English'],
};

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe('resume and match presentation', () => {
  it('exposes the score as an accessible percentage meter', () => {
    view = renderView(<MatchScore score={86} size="lg" />);

    const meter = view.required<HTMLElement>('[role="meter"]');
    expect(meter.getAttribute('aria-valuenow')).toBe('86');
    expect(meter.getAttribute('aria-label')).toBe('Match score: 86%');
  });

  it('renders the optimized CV as a structured ATS preview', () => {
    view = renderView(<ClassicResumePreview document={document} />);

    expect(
      view.required<HTMLElement>('[aria-label="CV preview for Sara Amrani"]')
        .textContent,
    ).toContain('Data analyst focused on transparent operational reporting.');
    expect(view.container.textContent).toContain('Professional Experience');
    expect(view.container.textContent).toContain('Atlas Data');
    expect(view.container.textContent).toContain('Université Hassan II');
    expect(view.container.textContent).toContain('SQL  •  Power BI');
  });
});
