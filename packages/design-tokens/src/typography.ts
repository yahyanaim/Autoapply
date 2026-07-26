export const fontFamily = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
  mono: 'JetBrains Mono, monospace',
} as const;

export const fontSize = {
  h1: { size: '32px', weight: 600, lineHeight: '48px' },
  h2: { size: '24px', weight: 600, lineHeight: '36px' },
  body: { size: '16px', weight: 400, lineHeight: '24px' },
  caption: { size: '12px', weight: 400, lineHeight: '18px' },
} as const;

export const lineHeight = 1.5;
