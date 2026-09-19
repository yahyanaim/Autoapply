import {
  ResumeParser,
  UnrecoverableResumeParseError,
} from '../infrastructure/parsers/resume-parser';

describe('ResumeParser', () => {
  const aiService = { complete: jest.fn() };
  const parser = new ResumeParser(aiService as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts a complete structured response inside a JSON code fence', async () => {
    aiService.complete.mockResolvedValue({
      content: `\`\`\`json
        {
          "skills": ["TypeScript"],
          "experience": [],
          "education": [],
          "projects": [],
          "languages": ["English"],
          "certifications": []
        }
      \`\`\``,
      model: 'test-model',
    });

    await expect(parser.parse('resume text', 'user-1')).resolves.toEqual(
      expect.objectContaining({ skills: ['TypeScript'], languages: ['English'] }),
    );
  });

  it('passes a queue boundary through to the trusted AI execution check', async () => {
    aiService.complete.mockResolvedValue({
      content: JSON.stringify({
        skills: [],
        experience: [],
        education: [],
        projects: [],
        languages: [],
        certifications: [],
      }),
      model: 'test-model',
    });

    await parser.parse('resume text', 'user-1', 'free');

    expect(aiService.complete).toHaveBeenCalledWith(
      'resume_parse',
      'user-1',
      { resumeText: 'resume text' },
      'free',
    );
  });

  it('rejects malformed JSON instead of marking an empty resume ready', async () => {
    aiService.complete.mockResolvedValue({ content: 'not json', model: 'test-model' });

    await expect(parser.parse('resume text', 'user-1')).rejects.toThrow(
      UnrecoverableResumeParseError,
    );
  });

  it('rejects arrays containing invalid nested values', async () => {
    aiService.complete.mockResolvedValue({
      content: JSON.stringify({
        skills: ['TypeScript'],
        experience: [{ title: 'Engineer' }],
        education: [],
        projects: [],
        languages: [],
        certifications: [],
      }),
      model: 'test-model',
    });

    await expect(parser.parse('resume text', 'user-1')).rejects.toThrow(
      'invalid resume structure',
    );
  });
});
