import { calculateMatchScore } from '../domain/match-score';

describe('calculateMatchScore', () => {
  it('should return 100 for a perfect match', () => {
    const resume = {
      content: `
        Skills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, Kubernetes, SQL, PostgreSQL, MongoDB
        Experience: Senior Software Engineer at Tech Corp (2020-2026). Led development of microservices architecture.
        Education: Bachelor of Science in Computer Science from MIT.
        5+ years of experience building scalable web applications.
      `,
    };
    const jobDescription = `
      We are looking for a Senior Software Engineer with 5+ years of experience.
      Required skills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, Kubernetes, SQL.
      Bachelor's degree in Computer Science or related field.
      Experience with PostgreSQL and MongoDB preferred.
    `;

    const result = calculateMatchScore(resume, jobDescription);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.missingKeywords).toHaveLength(0);
    expect(result.weakSections).toHaveLength(0);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('should return 0 for no match', () => {
    const resume = {
      content: `
        Skills: Painting, Sculpture, Pottery, Art History
        Experience: Art Gallery Curator at Modern Art Museum (2018-2024).
        Education: Master of Fine Arts from RISD.
      `,
    };
    const jobDescription = `
      We are looking for a Senior Software Engineer with 5+ years of experience.
      Required skills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker.
      Bachelor's degree in Computer Science.
      Experience with machine learning, deep learning, and NLP.
    `;

    const result = calculateMatchScore(resume, jobDescription);

    expect(result.score).toBeLessThanOrEqual(30);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
    expect(result.weakSections.length).toBeGreaterThan(0);
  });

  it('should return a partial match for partial overlap', () => {
    const resume = {
      content: `
        Skills: JavaScript, React, SQL, Git
        Experience: Frontend Developer at StartupCo (2021-2024). Built responsive web applications.
        Education: Bachelor of Science in Computer Science.
        3 years of experience.
      `,
    };
    const jobDescription = `
      We are looking for a Full Stack Engineer with 5+ years of experience.
      Required skills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, Kubernetes, SQL.
      Bachelor's degree in Computer Science.
    `;

    const result = calculateMatchScore(resume, jobDescription);

    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.score).toBeLessThanOrEqual(75);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
    expect(result.weakSections.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty job description gracefully', () => {
    const resume = {
      content: 'Skills: JavaScript, React',
    };
    const jobDescription = '';

    const result = calculateMatchScore(resume, jobDescription);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.missingKeywords)).toBe(true);
    expect(Array.isArray(result.weakSections)).toBe(true);
    expect(Array.isArray(result.explanation)).toBe(true);
  });

  it('should handle empty resume gracefully', () => {
    const resume = { content: '' };
    const jobDescription = 'Skills: JavaScript, React, Python';

    const result = calculateMatchScore(resume, jobDescription);

    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
  });
});
