import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderView, type RenderedView } from '@/test/render';
import { NoriMascot } from './NoriMascot';

let view: RenderedView | undefined;
afterEach(() => { view?.cleanup(); view = undefined; });

describe('approved Nori fox artwork', () => {
  it('ships the exact transparent source artwork', () => {
    const bytes = readFileSync(resolve(process.cwd(), 'public/images/nori/nori-fox.png'));
    expect(bytes.readUInt32BE(16)).toBe(1254);
    expect(bytes.readUInt32BE(20)).toBe(1254);
    expect(bytes[25]).toBe(6); // PNG RGBA, including transparency.
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('8b73980a6c00997b3b32c545ed15e3e687d4aa0de8fb9f82d7bc2a6aa530aa67');
  });

  for (const compact of [false, true]) {
    it(`uses the same complete fox for ${compact ? 'the header' : 'the launcher'}, including while thinking`, () => {
      view = renderView(<NoriMascot compact={compact} thinking />);
      const image = view.required<HTMLImageElement>('img');
      expect(image.alt).toBe('Nori, ApplyAI career assistant');
      expect(decodeURIComponent(image.getAttribute('src')!)).toContain('/images/nori/nori-fox.png');
      expect(image.width).toBe(image.height);
      expect(image.className).toContain('object-contain');
      expect(image.parentElement!.className).toContain('nori-mascot-head-shake');
      expect(image.getAttribute('data-nori-mascot')).toBe('static-fox');
      expect(image.getAttribute('data-thinking')).toBe('true');
      const eyelids = view.required<SVGElement>('svg[data-nori-blink]');
      expect(eyelids.getAttribute('aria-hidden')).toBe('true');
      expect(eyelids.getAttribute('focusable')).toBe('false');
      expect(eyelids.querySelectorAll('.nori-mascot-eyelid')).toHaveLength(2);
    });
  }

  it('keeps eyelid definitions unique between launcher and header', () => {
    view = renderView(<><NoriMascot /><NoriMascot compact /></>);
    const ids = Array.from(view.container.querySelectorAll('svg [id]'), (el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
