import {
  analyzeResumeTruthfulness,
  detectFabrications,
} from '../domain/fabrication-detector';

describe('detectFabrications', () => {
  it('should return no fabrications when content is unchanged', () => {
    const original = {
      content: `
        Skills: JavaScript, React, Node.js
        Experience: Software Engineer at Acme Corp (2020-2024)
        Education: BS Computer Science
      `,
    };
    const optimized = {
      content: `
        Skills: JavaScript, React, Node.js
        Experience: Software Engineer at Acme Corp (2020-2024)
        Education: BS Computer Science
      `,
    };

    const result = detectFabrications(original, optimized);

    expect(result).toHaveLength(0);
  });

  it('should detect added job titles', () => {
    const original = {
      content: `
        Skills: JavaScript, React
        Experience: Developer at Startup (2020-2024)
      `,
    };
    const optimized = {
      content: `
        Skills: JavaScript, React
        Experience: Senior Software Engineer at Startup (2020-2024)
        Lead Developer at BigTech (2018-2020)
      `,
    };

    const result = detectFabrications(original, optimized);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.type === 'title')).toBe(true);
  });

  it('should detect added dates', () => {
    const original = {
      content: `
        Skills: JavaScript, React
        Experience: Developer at Startup (2020-2024)
      `,
    };
    const optimized = {
      content: `
        Skills: JavaScript, React
        Experience: Developer at Startup (2020-2024)
        Freelance Work (Jan 2018 - Dec 2019)
      `,
    };

    const result = detectFabrications(original, optimized);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.type === 'date')).toBe(true);
  });

  it('should detect added skills', () => {
    const original = {
      content: 'Skills: JavaScript, React',
    };
    const optimized = {
      content: 'Skills: JavaScript, React, Python, Machine Learning, Docker',
    };

    const result = detectFabrications(original, optimized);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.type === 'skill')).toBe(true);
    expect(result.some((f) => f.detail.includes('Python'))).toBe(true);
  });

  it('should detect added work experience', () => {
    const original = {
      content:
        'Experience: Worked at Google as a Software Engineer from 2020 to 2024.',
    };
    const optimized = {
      content:
        'Experience: Worked at Google as a Software Engineer from 2020 to 2024. Worked at Meta as a Senior Engineer from 2018 to 2020.',
    };

    const result = detectFabrications(original, optimized);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.type === 'experience')).toBe(true);
  });

  it('should return empty array for empty inputs', () => {
    const original = { content: '' };
    const optimized = { content: '' };

    const result = detectFabrications(original, optimized);

    expect(result).toHaveLength(0);
  });

  it('detects an invented education claim', () => {
    const result = detectFabrications(
      { content: 'Education: Bachelor of Science in Computer Science' },
      {
        content:
          'Education: Bachelor of Science in Computer Science. Master degree in Artificial Intelligence',
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'education' })]),
    );
  });

  it('detects an invented certification', () => {
    const result = detectFabrications(
      { content: 'Skills: AWS, Docker' },
      { content: 'Skills: AWS, Docker. AWS Certified Solutions Architect' },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'certification' }),
      ]),
    );
  });

  it('detects an invented quantitative achievement', () => {
    const result = detectFabrications(
      { content: 'Improved API performance.' },
      { content: 'Improved API performance by 45% for 2 million users.' },
    );

    expect(result).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'metric' })]),
    );
  });

  it('detects non-software skills added outside the verified profile', () => {
    const result = detectFabrications(
      { content: 'Marketing specialist with campaign experience.' },
      {
        content:
          'Marketing specialist skilled in Salesforce, Adobe Photoshop, and SEC compliance.',
      },
      {
        original: {
          skills: ['Salesforce', 'Adobe Photoshop'],
          experience: [],
          education: [],
          projects: [],
          certifications: [],
        },
        optimized: {
          skills: ['Salesforce', 'Adobe Photoshop', 'SEC compliance'],
          experience: [],
          education: [],
          projects: [],
          certifications: [],
        },
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'skill',
          detail: expect.stringContaining('SEC compliance'),
        }),
      ]),
    );
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'skill',
          detail: expect.stringContaining('Salesforce'),
        }),
      ]),
    );
  });

  it('detects an employer added to structured experience entries', () => {
    const result = detectFabrications(
      { content: 'Account Manager — Atlas Distribution' },
      {
        content:
          'Account Manager — Atlas Distribution. Regional Director — Northstar Group.',
      },
      {
        original: {
          skills: [],
          experience: [
            {
              company: 'Atlas Distribution',
              title: 'Account Manager',
              startDate: '2021',
              endDate: '2024',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
        optimized: {
          skills: [],
          experience: [
            {
              company: 'Atlas Distribution',
              title: 'Account Manager',
              startDate: '2021',
              endDate: '2024',
            },
            {
              company: 'Northstar Group',
              title: 'Regional Director',
              startDate: '2019',
              endDate: '2020',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'experience',
          detail: expect.stringContaining('Northstar Group'),
        }),
        expect.objectContaining({
          type: 'title',
          detail: expect.stringContaining('Regional Director'),
        }),
      ]),
    );
  });

  it('detects structured education and certification additions', () => {
    const result = detectFabrications(
      { content: 'Bachelor of Commerce, Hassan II University' },
      {
        content:
          'Master of Finance, Hassan II University. Chartered Financial Analyst.',
      },
      {
        original: {
          skills: ['Financial modeling'],
          experience: [],
          education: [
            {
              institution: 'Hassan II University',
              degree: 'Bachelor of Commerce',
              startDate: '2017',
              endDate: '2020',
            },
          ],
          projects: [],
          certifications: [],
        },
        optimized: {
          skills: ['Financial modeling'],
          experience: [],
          education: [
            {
              institution: 'Hassan II University',
              degree: 'Master of Finance',
              startDate: '2017',
              endDate: '2020',
            },
          ],
          projects: [],
          certifications: ['Chartered Financial Analyst'],
        },
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'education',
          detail: expect.stringContaining('Master of Finance'),
        }),
        expect.objectContaining({
          type: 'certification',
          detail: expect.stringContaining('Chartered Financial Analyst'),
        }),
      ]),
    );
  });

  it('detects recombined employers and titles from different verified roles', () => {
    const result = detectFabrications(
      { content: 'Designer at Studio One. Manager at Studio Two.' },
      { content: 'Manager at Studio One.' },
      {
        original: {
          skills: [],
          experience: [
            {
              company: 'Studio One',
              title: 'Designer',
              startDate: '2020',
              endDate: '2022',
            },
            {
              company: 'Studio Two',
              title: 'Manager',
              startDate: '2022',
              endDate: '2024',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
        optimized: {
          skills: [],
          experience: [
            {
              company: 'Studio One',
              title: 'Manager',
              startDate: '2020',
              endDate: '2022',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'experience',
          detail: expect.stringContaining('not found together'),
        }),
      ]),
    );
  });

  it('detects changed dates on an otherwise verified role', () => {
    const result = detectFabrications(
      { content: 'Analyst at Atlas Bank, 2021–2024.' },
      { content: 'Analyst at Atlas Bank, 2019–2024.' },
      {
        original: {
          skills: [],
          experience: [
            {
              company: 'Atlas Bank',
              title: 'Analyst',
              startDate: '2021',
              endDate: '2024',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
        optimized: {
          skills: [],
          experience: [
            {
              company: 'Atlas Bank',
              title: 'Analyst',
              startDate: '2019',
              endDate: '2024',
            },
          ],
          education: [],
          projects: [],
          certifications: [],
        },
      },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'date',
          detail: expect.stringContaining('2019'),
        }),
      ]),
    );
  });

  it('treats an empty current-role end date as Present', () => {
    const original = {
      skills: [],
      experience: [
        {
          company: 'Atlas Bank',
          title: 'Analyst',
          startDate: '2023',
          endDate: null,
          description: 'Prepared reports.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };
    const optimized = {
      ...original,
      experience: [
        {
          ...original.experience[0],
          endDate: 'Present',
        },
      ],
    };

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: JSON.stringify(optimized) },
      { original, optimized },
    );

    expect(report.summary.unsupported_blocked).toBe(0);
  });

  it('allows structured claims that remain grounded in the verified profile', () => {
    const structuredResume = {
      skills: ['Adobe Photoshop', 'Brand strategy'],
      experience: [
        {
          company: 'Creative Studio',
          title: 'Brand Designer',
          startDate: '2020',
          endDate: '2024',
        },
      ],
      education: [
        {
          institution: 'Casablanca School of Design',
          degree: 'Diploma in Graphic Design',
          startDate: '2017',
          endDate: '2020',
        },
      ],
      projects: [
        {
          name: 'Retail rebrand',
          technologies: ['Adobe Illustrator'],
        },
      ],
      certifications: ['UX Design Fundamentals'],
    };

    const result = detectFabrications(
      { content: 'Improved an established retail brand identity.' },
      { content: 'Strengthened an established retail brand identity.' },
      {
        original: structuredResume,
        optimized: structuredResume,
      },
    );

    expect(result).toHaveLength(0);
  });

  it.each([
    {
      profession: 'engineering',
      original: {
        skills: ['TypeScript', 'React'],
        experience: [
          {
            company: 'Atlas Labs',
            title: 'Software Engineer',
            startDate: '2022',
            endDate: 'Present',
            description: 'Built React account features.',
            highlights: ['Maintained TypeScript services'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['English'],
      },
      optimized: {
        skills: ['TypeScript', 'React', 'Rust'],
        experience: [
          {
            company: 'Atlas Labs',
            title: 'Software Engineer',
            startDate: '2022',
            endDate: 'Present',
            description: 'Built React account features.',
            highlights: ['Maintained TypeScript services'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['English'],
      },
      blockedType: 'skill',
      blockedText: 'Rust',
    },
    {
      profession: 'marketing',
      original: {
        skills: ['Campaign planning', 'Google Analytics'],
        experience: [
          {
            company: 'North Agency',
            title: 'Marketing Specialist',
            startDate: '2021',
            endDate: '2024',
            description: 'Planned digital campaigns.',
            highlights: ['Reported campaign performance'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['French'],
      },
      optimized: {
        skills: ['Campaign planning', 'Google Analytics'],
        experience: [
          {
            company: 'North Agency',
            title: 'Marketing Specialist',
            startDate: '2021',
            endDate: '2024',
            description: 'Planned digital campaigns.',
            highlights: ['Reported campaign performance'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['French', 'Spanish'],
      },
      blockedType: 'language',
      blockedText: 'Spanish',
    },
    {
      profession: 'finance',
      original: {
        skills: ['Financial modeling'],
        experience: [
          {
            company: 'Atlas Bank',
            title: 'Financial Analyst',
            startDate: '2020',
            endDate: '2024',
            description: 'Prepared monthly portfolio reports.',
            highlights: ['Reviewed investment performance'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['Arabic', 'French'],
      },
      optimized: {
        skills: ['Financial modeling'],
        experience: [
          {
            company: 'Atlas Bank',
            title: 'Financial Analyst',
            startDate: '2020',
            endDate: '2024',
            description: 'Prepared monthly portfolio reports.',
            highlights: ['Reviewed investment performance'],
          },
        ],
        education: [],
        projects: [
          {
            name: 'Risk forecasting platform',
            description: 'Forecast portfolio exposure.',
            technologies: ['Python'],
          },
        ],
        certifications: [],
        languages: ['Arabic', 'French'],
      },
      blockedType: 'project',
      blockedText: 'Risk forecasting platform',
    },
    {
      profession: 'design',
      original: {
        skills: ['Figma', 'Brand identity'],
        experience: [
          {
            company: 'Studio Casa',
            title: 'Brand Designer',
            startDate: '2019',
            endDate: '2024',
            description: 'Designed brand identity systems in Figma.',
            highlights: ['Created reusable brand assets'],
          },
        ],
        education: [],
        projects: [
          {
            name: 'Retail rebrand',
            description: 'Created a retail identity system.',
            technologies: ['Figma'],
          },
        ],
        certifications: [],
        languages: ['French'],
      },
      optimized: {
        skills: ['Figma', 'Brand identity'],
        experience: [
          {
            company: 'Studio Casa',
            title: 'Brand Designer',
            startDate: '2019',
            endDate: '2024',
            description: 'Designed brand identity systems in Figma.',
            highlights: ['Created reusable brand assets'],
          },
        ],
        education: [],
        projects: [
          {
            name: 'Invented mobile app',
            description: 'Designed a mobile product.',
            technologies: ['Figma'],
          },
        ],
        certifications: [],
        languages: ['French'],
      },
      blockedType: 'project',
      blockedText: 'Invented mobile app',
    },
  ])(
    'blocks unsupported structured facts for a $profession CV',
    ({ original, optimized, blockedType, blockedText }) => {
      const report = analyzeResumeTruthfulness(
        { content: JSON.stringify(original) },
        { content: JSON.stringify(optimized) },
        { original, optimized },
      );

      expect(report.status).toBe('blocked');
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            classification: 'unsupported_blocked',
            type: blockedType,
            detail: expect.stringContaining(blockedText),
          }),
        ]),
      );
    },
  );

  it('classifies grounded narrative changes and wording that needs confirmation', () => {
    const original = {
      skills: ['Campaign planning', 'Google Analytics'],
      experience: [
        {
          company: 'North Agency',
          title: 'Marketing Specialist',
          startDate: '2021',
          endDate: '2024',
          description: 'Planned digital campaigns using Google Analytics.',
          highlights: ['Reported campaign performance'],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: ['French'],
    };
    const optimized = {
      ...original,
      profile:
        'Marketing Specialist with Campaign planning and Google Analytics experience.',
      experience: [
        {
          ...original.experience[0],
          description:
            'Directed global acquisitions and negotiated television partnerships.',
        },
      ],
    };

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: JSON.stringify(optimized) },
      { original, optimized },
    );

    expect(report.status).toBe('review_required');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'safe_rewording',
          section: 'Profile summary',
        }),
        expect.objectContaining({
          classification: 'needs_confirmation',
          section: expect.stringContaining('description'),
          proposed: expect.stringContaining('television partnerships'),
        }),
      ]),
    );
  });

  it('blocks an invented numerical achievement while preserving detailed evidence', () => {
    const original = {
      skills: ['Figma'],
      experience: [
        {
          company: 'Studio Casa',
          title: 'Designer',
          startDate: '2020',
          endDate: '2024',
          description: 'Improved the design system.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };
    const optimized = {
      ...original,
      experience: [
        {
          ...original.experience[0],
          description: 'Improved the design system by 45%.',
        },
      ],
    };

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: JSON.stringify(optimized) },
      { original, optimized },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'unsupported_blocked',
          type: 'metric',
          detail: expect.stringContaining('45%'),
          proposed: '45%',
        }),
      ]),
    );
  });

  it('blocks moving a verified achievement from one role to another', () => {
    const original = {
      skills: ['Sales strategy', 'Figma'],
      experience: [
        {
          company: 'Atlas',
          title: 'Sales Lead',
          startDate: '2020',
          endDate: '2022',
          description: 'Grew sales by 30%.',
          highlights: [],
        },
        {
          company: 'Beta',
          title: 'Designer',
          startDate: '2022',
          endDate: '2024',
          description: 'Designed brand assets in Figma.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };
    const optimized = {
      ...original,
      experience: [
        original.experience[0],
        {
          ...original.experience[1],
          description: 'Designed brand assets in Figma and grew sales by 30%.',
        },
      ],
    };

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: JSON.stringify(optimized) },
      { original, optimized },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'unsupported_blocked',
          type: 'metric',
          section: expect.stringContaining('Designer'),
          detail: expect.stringContaining('different verified evidence'),
          proposed: '30%',
        }),
      ]),
    );
  });

  it('blocks recombining a verified title with a different verified employer in the profile', () => {
    const original = {
      skills: [],
      experience: [
        {
          company: 'Alpha',
          title: 'Chief Executive Officer',
          startDate: '2020',
          endDate: '2022',
          description: 'Led company strategy.',
          highlights: [],
        },
        {
          company: 'Google',
          title: 'Software Engineer',
          startDate: '2022',
          endDate: '2024',
          description: 'Built software systems.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: 'Chief Executive Officer at Google.' },
      {
        original,
        optimized: {
          ...original,
          profile: 'Chief Executive Officer at Google.',
        },
      },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'unsupported_blocked',
          section: 'Profile summary',
          detail: expect.stringContaining('different employer'),
        }),
      ]),
    );
  });

  it('blocks attributing another role metric to the role named in the profile', () => {
    const original = {
      skills: ['Sales strategy', 'Figma'],
      experience: [
        {
          company: 'Alpha',
          title: 'Sales Lead',
          startDate: '2020',
          endDate: '2022',
          description: 'Grew revenue by 30%.',
          highlights: [],
        },
        {
          company: 'Google',
          title: 'Designer',
          startDate: '2022',
          endDate: '2024',
          description: 'Designed brand assets.',
          highlights: [],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };
    const profile = 'Designer at Google, grew revenue by 30%.';

    const report = analyzeResumeTruthfulness(
      { content: JSON.stringify(original) },
      { content: profile },
      { original, optimized: { ...original, profile } },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'unsupported_blocked',
          type: 'metric',
          section: 'Profile summary',
          proposed: '30%',
        }),
      ]),
    );
  });
});
