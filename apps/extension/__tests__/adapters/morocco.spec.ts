import { beforeEach, describe, expect, it } from 'vitest';
import { MoroccoJobBoardAdapter } from '../../src/content-scripts/adapters/morocco/adapter';

describe('MoroccoJobBoardAdapter', () => {
  const adapter = new MoroccoJobBoardAdapter();

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('handles only the configured Moroccan job boards', () => {
    expect(adapter.canHandle('https://ma.indeed.com/viewjob?jk=123')).toBe(true);
    expect(adapter.canHandle('https://www.rekrute.com/offre-emploi-123')).toBe(true);
    expect(adapter.canHandle('https://www.anapec.org/jobs/123')).toBe(true);
    expect(adapter.canHandle('https://www.marocannonces.com/job/123')).toBe(true);
    expect(adapter.canHandle('https://malicious.example/indeed.com')).toBe(false);
  });

  it('prefers schema.org JobPosting data over brittle page selectors', () => {
    document.body.innerHTML = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Platform Engineer",
          "description": "<p>Build reliable TypeScript services in Casablanca.</p>",
          "hiringOrganization": { "name": "Acme Maroc" },
          "url": "https://ma.indeed.com/viewjob?jk=123"
        }
      </script>
    `;

    expect(adapter.extractJobDescription()).toEqual({
      title: 'Platform Engineer',
      company: 'Acme Maroc',
      description: 'Build reliable TypeScript services in Casablanca.',
      url: 'https://ma.indeed.com/viewjob?jk=123',
    });
  });
});
