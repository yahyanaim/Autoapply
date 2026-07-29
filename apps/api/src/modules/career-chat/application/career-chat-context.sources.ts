export const OFFICIAL_MOROCCO_CAREER_SOURCES = [
  'https://www.anapec.org/',
  'https://www.emploi-public.ma/',
  'https://www.travail.gov.ma/',
] as const;

export function officialMoroccoCareerContext(): string {
  return [
    'Trusted general Morocco career resources:',
    ...OFFICIAL_MOROCCO_CAREER_SOURCES.map((source) => `- ${source}`),
  ].join('\n');
}
