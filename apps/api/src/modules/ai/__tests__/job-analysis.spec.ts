import {
  JobAnalysisValidationError,
  readJobAnalysis,
} from '../domain/job-analysis';

describe('job analysis validation', () => {
  it('normalizes and deduplicates a grounded job analysis', () => {
    expect(
      readJobAnalysis({
        summary: ' Build reliable services. ',
        responsibilities: ['Build APIs', 'Build APIs'],
        requiredSkills: ['TypeScript'],
        preferredSkills: [],
        experienceLevel: '3+ years',
        education: [],
        languages: ['English'],
        keywords: ['APIs', 'TypeScript'],
      }),
    ).toEqual({
      summary: 'Build reliable services.',
      responsibilities: ['Build APIs'],
      requiredSkills: ['TypeScript'],
      preferredSkills: [],
      experienceLevel: '3+ years',
      education: [],
      languages: ['English'],
      keywords: ['APIs', 'TypeScript'],
    });
  });

  it('rejects malformed model output', () => {
    expect(() =>
      readJobAnalysis({
        summary: '',
        responsibilities: 'not-an-array',
      }),
    ).toThrow(JobAnalysisValidationError);
  });
});
