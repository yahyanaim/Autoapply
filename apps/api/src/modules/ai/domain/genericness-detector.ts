const GENERIC_PHRASES = [
  'i am writing to express my interest',
  'i am excited to apply',
  'hardworking team player',
  'passionate about technology',
  'fast-paced environment',
  'think outside the box',
  'detail-oriented',
  'go-getter',
  'synergy',
] as const;

export function scoreGenericness(content: string): {
  score: number;
  matchedPhrases: string[];
} {
  const normalized = content.toLowerCase();
  const matchedPhrases = GENERIC_PHRASES.filter((phrase) =>
    normalized.includes(phrase),
  );
  const words = content.trim().split(/\s+/).filter(Boolean);
  const specificitySignals =
    (content.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).length +
    (content.match(/\b[A-Z][A-Za-z0-9&.-]{2,}\b/g) ?? []).length;
  const shortPenalty = words.length < 180 ? 20 : 0;
  const specificityPenalty = specificitySignals < 3 ? 15 : 0;
  return {
    score: Math.min(
      100,
      matchedPhrases.length * 25 + shortPenalty + specificityPenalty,
    ),
    matchedPhrases: [...matchedPhrases],
  };
}
