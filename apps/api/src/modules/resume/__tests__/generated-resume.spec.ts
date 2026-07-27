import {
  buildGeneratedResumeDocument,
  generatedResumeToText,
  GeneratedResumeValidationError,
} from '../domain/generated-resume';

const parsedResume = {
  skills: ['TypeScript', 'React', 'PostgreSQL'],
  experience: [
    {
      title: 'Software Engineer',
      company: 'Acme',
      startDate: '2022',
      endDate: 'Present',
      description: 'Built customer applications.',
      highlights: ['Delivered product features'],
    },
  ],
  education: [
    {
      degree: 'Bachelor of Computer Science',
      institution: 'Example University',
      startDate: '2017',
      endDate: '2021',
    },
  ],
  projects: [
    {
      name: 'Portfolio',
      description: 'Created a personal portfolio.',
      technologies: ['React'],
      url: 'https://example.com',
    },
  ],
  languages: ['English'],
  certifications: ['Cloud Fundamentals'],
};

const optimization = {
  profileSummary: 'Software Engineer experienced in TypeScript and React.',
  experience: [
    {
      index: 0,
      description: 'Built customer applications using TypeScript and React.',
      highlights: ['Delivered product features backed by PostgreSQL'],
    },
  ],
  projects: [
    {
      index: 0,
      description: 'Created a React portfolio presenting verified project work.',
    },
  ],
  skillsOrder: ['TypeScript', 'React', 'PostgreSQL'],
};

describe('generated resume document', () => {
  it('combines optimized copy with immutable verified facts', () => {
    const document = buildGeneratedResumeDocument(
      parsedResume,
      optimization,
      {
        fullName: 'Jamie Candidate',
        email: 'jamie@example.com',
        location: 'Austin, Texas',
      },
    );

    expect(document).toEqual(
      expect.objectContaining({
        template: 'classic-ats-v1',
        contact: expect.objectContaining({
          fullName: 'Jamie Candidate',
          email: 'jamie@example.com',
        }),
        skills: ['TypeScript', 'React', 'PostgreSQL'],
      }),
    );
    expect(document.experience[0]).toEqual(
      expect.objectContaining({
        title: 'Software Engineer',
        company: 'Acme',
        startDate: '2022',
        endDate: 'Present',
        description: 'Built customer applications using TypeScript and React.',
      }),
    );
    expect(generatedResumeToText(document)).toContain('PROFESSIONAL EXPERIENCE');
  });

  it('rejects an AI response that adds an unverified skill', () => {
    expect(() =>
      buildGeneratedResumeDocument(
        parsedResume,
        { ...optimization, skillsOrder: ['TypeScript', 'React', 'Rust'] },
        { email: 'jamie@example.com' },
      ),
    ).toThrow(GeneratedResumeValidationError);
  });

  it('rejects an AI response that omits a verified experience entry', () => {
    expect(() =>
      buildGeneratedResumeDocument(
        parsedResume,
        { ...optimization, experience: [] },
        { email: 'jamie@example.com' },
      ),
    ).toThrow('every verified experience entry');
  });
});
