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
    expect(result.some(f => f.type === 'title')).toBe(true);
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
    expect(result.some(f => f.type === 'date')).toBe(true);
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
    expect(result.some(f => f.type === 'skill')).toBe(true);
    expect(result.some(f => f.detail.includes('Python'))).toBe(true);
  });

  it('should detect added work experience', () => {
    const original = {
      content: 'Experience: Worked at Google as a Software Engineer from 2020 to 2024.',
    };
    const optimized = {
      content: 'Experience: Worked at Google as a Software Engineer from 2020 to 2024. Worked at Meta as a Senior Engineer from 2018 to 2020.',
    };

    const result = detectFabrications(original, optimized);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(f => f.type === 'experience')).toBe(true);
  });

  it('should return empty array for empty inputs', () => {
    const original = { content: '' };
    const optimized = { content: '' };

    const result = detectFabrications(original, optimized);

    expect(result).toHaveLength(0);
  });
});
