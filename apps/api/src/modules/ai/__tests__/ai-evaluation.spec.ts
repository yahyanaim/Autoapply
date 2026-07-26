import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateMatchScore } from '../domain/match-score';
import { matchScoreGoldenSet } from '../evaluations/match-score.golden-set';

describe('AI quality regression harness', () => {
  it.each(matchScoreGoldenSet)(
    '$name stays in its human-reviewed score band',
    ({ resume, jobDescription, expectedScore, expectedMissingKeywords }) => {
      const result = calculateMatchScore({ content: resume }, jobDescription);

      expect(result.score).toBeGreaterThanOrEqual(expectedScore.min);
      expect(result.score).toBeLessThanOrEqual(expectedScore.max);
      expect(result.missingKeywords).toEqual(
        expect.arrayContaining(expectedMissingKeywords),
      );
    },
  );

  it('keeps non-fabrication and anti-genericness rules in shipped prompts', () => {
    const promptDirectory = join(__dirname, '..', 'prompts');
    const optimize = readFileSync(
      join(promptDirectory, 'resume-optimize.v2.md'),
      'utf8',
    );
    const coverLetter = readFileSync(
      join(promptDirectory, 'cover-letter.v2.md'),
      'utf8',
    );

    expect(optimize).toMatch(/never fabricate/i);
    expect(optimize).toMatch(/never alter dates/i);
    expect(coverLetter).toMatch(/no filler phrases/i);
    expect(coverLetter).toMatch(/250–400 words/i);
  });
});
