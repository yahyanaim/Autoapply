import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GreenhouseAdapter } from '../../src/content-scripts/adapters/greenhouse/adapter';

describe('GreenhouseAdapter', () => {
  let adapter: GreenhouseAdapter;

  beforeEach(() => {
    adapter = new GreenhouseAdapter();
    document.body.innerHTML = '';
  });

  describe('canHandle', () => {
    it('returns true for greenhouse URLs', () => {
      expect(adapter.canHandle('https://boards.greenhouse.io/acme/jobs/123456')).toBe(true);
      expect(adapter.canHandle('https://boards.greenhouse.io/test')).toBe(true);
    });

    it('returns false for non-greenhouse URLs', () => {
      expect(adapter.canHandle('https://jobs.lever.co/acme')).toBe(false);
      expect(adapter.canHandle('https://example.com')).toBe(false);
      expect(adapter.canHandle('https://example.com/?next=boards.greenhouse.io')).toBe(false);
      expect(adapter.canHandle('not a URL')).toBe(false);
    });
  });

  describe('detectJobPosting', () => {
    it('returns true when job post element exists', () => {
      document.body.innerHTML = '<div id="content"><div class="job-post">Job</div></div>';
      expect(adapter.detectJobPosting()).toBe(true);
    });

    it('returns true when application form exists', () => {
      document.body.innerHTML = '<form id="application_form"></form>';
      expect(adapter.detectJobPosting()).toBe(true);
    });

    it('returns false when no job posting elements found', () => {
      document.body.innerHTML = '<div>Regular page</div>';
      expect(adapter.detectJobPosting()).toBe(false);
    });
  });

  describe('extractJobDescription', () => {
    it('extracts job title from h1', () => {
      document.body.innerHTML = '<h1>Software Engineer</h1>';
      const result = adapter.extractJobDescription();
      expect(result?.title).toBe('Software Engineer');
    });

    it('extracts company name', () => {
      document.body.innerHTML = `
        <div class="header-logo"><img alt="Acme Corp" /></div>
        <h1>Engineer</h1>
      `;
      const result = adapter.extractJobDescription();
      expect(result?.company).toBe('Acme Corp');
    });

    it('extracts job description', () => {
      document.body.innerHTML = `
        <h1>Engineer</h1>
        <div class="section--text"><div class="text">We are looking for...</div></div>
      `;
      const result = adapter.extractJobDescription();
      expect(result?.description).toContain('We are looking for');
    });

    it('returns null when no description found', () => {
      document.body.innerHTML = '<h1>Empty Page</h1>';
      const result = adapter.extractJobDescription();
      expect(result?.description).toBeTruthy();
    });
  });

  describe('findFormFields', () => {
    it('finds input fields in application form', () => {
      document.body.innerHTML = `
        <form id="application_form">
          <label for="name">Name</label>
          <input id="name" type="text" required />
          <label for="email">Email</label>
          <input id="email" type="email" />
          <textarea id="cover_letter"></textarea>
        </form>
      `;
      const fields = adapter.findFormFields();
      expect(fields.length).toBe(3);
      expect(fields[0].id).toBe('name');
      expect(fields[0].required).toBe(true);
      expect(fields[1].type).toBe('email');
      expect(fields[2].type).toBe('textarea');
    });

    it('ignores hidden and submit inputs', () => {
      document.body.innerHTML = `
        <form id="application_form">
          <input type="hidden" name="token" value="abc" />
          <input type="submit" value="Apply" />
          <input id="name" type="text" />
        </form>
      `;
      const fields = adapter.findFormFields();
      expect(fields.length).toBe(1);
      expect(fields[0].id).toBe('name');
    });

    it('returns empty array when no form exists', () => {
      document.body.innerHTML = '<div>No form here</div>';
      const fields = adapter.findFormFields();
      expect(fields).toEqual([]);
    });
  });
});
