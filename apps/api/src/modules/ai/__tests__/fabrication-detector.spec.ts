import { detectFabrications } from '../domain/fabrication-detector';

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
      content: 'Experience: Worked at Google as a Software Engineer from 2020 to 2024.',
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
      expect.arrayContaining([expect.objectContaining({ type: 'certification' })]),
    );
  });

  it('detects an invented quantitative achievement', () => {
    const result = detectFabrications(
      { content: 'Improved API performance.' },
      { content: 'Improved API performance by 45% for 2 million users.' },
    );

    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'metric' })]));
  });

  it('detects non-software skills added outside the verified profile', () => {
    const result = detectFabrications(
      { content: 'Marketing specialist with campaign experience.' },
      {
        content: 'Marketing specialist skilled in Salesforce, Adobe Photoshop, and SEC compliance.',
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
        content: 'Account Manager — Atlas Distribution. Regional Director — Northstar Group.',
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
        content: 'Master of Finance, Hassan II University. Chartered Financial Analyst.',
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
});
