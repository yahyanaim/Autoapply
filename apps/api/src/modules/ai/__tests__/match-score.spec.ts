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

  it('scores a structured original CV against a French job offer', () => {
    const originalResume = {
      skills: ['SQL', 'Python', 'Power BI', 'Excel'],
      experience: [
        {
          title: 'Data Analyst',
          company: 'Example Morocco',
          startDate: '2020-01',
          endDate: '2024-12',
          description:
            'Created reporting dashboards and automated sales-data analysis.',
          highlights: [
            'Built Power BI dashboards',
            'Analyzed sales data with SQL',
          ],
        },
      ],
      education: [
        {
          degree: 'Master en Data Science',
          institution: 'Université Hassan II',
          startDate: '2018',
          endDate: '2020',
        },
      ],
      projects: [],
      languages: ['Français courant', 'Anglais B2'],
      certifications: [],
    };
    const jobDescription = `
      Data Analyst
      Nous recherchons un Data Analyst avec minimum 3 ans d'expérience.
      Compétences obligatoires : SQL, Power BI, Excel et Python.
      La maîtrise du français et de l'anglais est requise.
      Bac+5 obligatoire.
      Missions : créer des tableaux de bord, analyser les ventes et automatiser le reporting.
    `;

    const result = calculateMatchScore(
      { content: JSON.stringify(originalResume) },
      jobDescription,
      'original CV',
    );

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.missingKeywords).toEqual([]);
    expect(result.breakdown).toEqual(
      expect.objectContaining({
        skills: 100,
        education: 100,
        languages: 100,
      }),
    );
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['SQL', 'Power BI', 'English', 'French']),
    );
    expect(result.explanation).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/original CV only/i),
        expect.stringMatching(/job asks for 3\+ years/i),
      ]),
    );
  });

  it('uses exact aliases and does not confuse JavaScript with Java', () => {
    const result = calculateMatchScore(
      { content: 'Frontend developer. Skills: JavaScript and React.' },
      'Java Backend Engineer\nJava and Spring Boot are mandatory.',
    );

    expect(result.matchedKeywords).not.toContain('Java');
    expect(result.missingKeywords).toEqual(
      expect.arrayContaining(['Java', 'Spring Boot']),
    );
  });

  it('weights mandatory gaps ahead of preferred gaps', () => {
    const result = calculateMatchScore(
      { content: 'Software engineer skilled in TypeScript.' },
      `
        Backend Engineer
        Required skills: TypeScript and Docker.
        Preferred: Kubernetes.
      `,
    );

    expect(result.matchedKeywords).toContain('TypeScript');
    expect(result.missingKeywords.indexOf('Docker')).toBeLessThan(
      result.missingKeywords.indexOf('Kubernetes'),
    );
    expect(result.breakdown.skills).toBeGreaterThan(30);
    expect(result.breakdown.skills).toBeLessThan(60);
  });

  it('does not double-count overlapping employment dates', () => {
    const originalResume = {
      skills: ['SQL'],
      experience: [
        {
          title: 'Data Analyst',
          company: 'Company A',
          startDate: '2020-01',
          endDate: '2022-12',
          description: 'Analyzed data.',
          highlights: [],
        },
        {
          title: 'Data Analyst',
          company: 'Company B',
          startDate: '2021-01',
          endDate: '2023-12',
          description: 'Created reports.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      languages: [],
      certifications: [],
    };
    const result = calculateMatchScore(
      { content: JSON.stringify(originalResume) },
      'Data Analyst\nMinimum 5 years of experience. SQL is required.',
    );

    expect(result.explanation.join(' ')).toMatch(/CV verifies 4 years/i);
    expect(result.missingKeywords).toContain('5+ years experience');
  });
});
