import { BaseAdapter } from '../base.adapter';
import type { FormField, JobDescription } from '../types';

const SUPPORTED_HOSTS = new Set([
  'ma.indeed.com',
  'rekrute.com',
  'www.rekrute.com',
  'anapec.org',
  'www.anapec.org',
  'marocannonces.com',
  'www.marocannonces.com',
]);

export class MoroccoJobBoardAdapter extends BaseAdapter {
  name = 'morocco-job-board';

  canHandle(url: string): boolean {
    try {
      return SUPPORTED_HOSTS.has(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  detectJobPosting(): boolean {
    return Boolean(
      this.readStructuredJob() ||
        this.querySelector(
          '[data-testid="jobsearch-JobComponent-description"], .jobsearch-JobComponent-description, .job-description, .description, #jobDescriptionText',
        ),
    );
  }

  extractJobDescription(): JobDescription | null {
    const structured = this.readStructuredJob();
    if (structured) return structured;

    const title =
      this.firstText([
        'h1[data-testid="jobsearch-JobInfoHeader-title"]',
        'h1.jobsearch-JobInfoHeader-title',
        '.job-title h1',
        '.offer-title',
        'h1',
      ]) || document.title;
    const company =
      this.firstText([
        '[data-testid="inlineHeader-companyName"]',
        '[data-company-name]',
        '.company-name',
        '.recruiter-name',
        '.company',
      ]) || 'Company not listed';
    const description = this.firstText([
      '#jobDescriptionText',
      '[data-testid="jobsearch-JobComponent-description"]',
      '.jobsearch-JobComponent-description',
      '.job-description',
      '.offer-description',
      '.description',
      'main',
    ]);
    if (!description || description.length < 20) return null;
    return {
      title,
      company,
      description: description.slice(0, 200_000),
      url: canonicalUrl(),
    };
  }

  findFormFields(): FormField[] {
    return Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('form input, form textarea, form select'),
    )
      .filter(
        (input) =>
          !['hidden', 'submit', 'file', 'password', 'checkbox', 'radio'].includes(
            input.type,
          ) && !input.disabled,
      )
      .flatMap((input) => {
        const id = input.id || input.name;
        if (!id) return [];
        return [
          {
            id,
            label:
              this.getElementText(input.labels?.[0] ?? null) ||
              input.getAttribute('aria-label') ||
              ('placeholder' in input ? input.placeholder : '') ||
              id,
            type:
              input.tagName === 'TEXTAREA'
                ? 'textarea'
                : input.tagName === 'SELECT'
                  ? 'select'
                  : input.type || 'text',
            required:
              input.required || input.getAttribute('aria-required') === 'true',
          },
        ];
      });
  }

  fillField(fieldId: string, value: string): boolean {
    const element = this.findFormControl(fieldId);
    if (
      !element ||
      element.value.trim() ||
      element.disabled ||
      ('readOnly' in element && element.readOnly)
    ) {
      return false;
    }
    if (element instanceof HTMLSelectElement) {
      this.setSelectValue(element, value);
      return Boolean(element.value);
    }
    this.setInputValue(element, value);
    return true;
  }

  private firstText(selectors: string[]): string {
    for (const selector of selectors) {
      const text = this.getElementText(this.querySelector(selector));
      if (text) return text;
    }
    return '';
  }

  private readStructuredJob(): JobDescription | null {
    for (const script of Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
    )) {
      try {
        const parsed = JSON.parse(script.textContent || 'null') as unknown;
        const job = findJobPosting(parsed);
        if (!job) continue;
        const title = textValue(job.title);
        const description = stripHtml(textValue(job.description));
        if (!title || description.length < 20) continue;
        const organization = recordValue(job.hiringOrganization);
        return {
          title,
          company: textValue(organization?.name) || 'Company not listed',
          description: description.slice(0, 200_000),
          url: textValue(job.url) || canonicalUrl(),
        };
      } catch {
        // Invalid structured data is ignored in favor of the DOM fallback.
      }
    }
    return null;
  }
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  const record = recordValue(value);
  if (!record) return null;
  const type = record['@type'];
  if (
    type === 'JobPosting' ||
    (Array.isArray(type) && type.includes('JobPosting'))
  ) {
    return record;
  }
  return findJobPosting(record['@graph']);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripHtml(value: string): string {
  const element = document.createElement('div');
  element.innerHTML = value;
  return (element.innerText || element.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalUrl(): string {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const url = new URL(canonical || window.location.href);
  url.hash = '';
  return url.toString();
}
