import type { FormField, JobDescription } from '../types';
import { BaseAdapter } from '../base.adapter';

export class LeverAdapter extends BaseAdapter {
  name = 'lever';

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'lever.co' || hostname.endsWith('.lever.co');
    } catch {
      return false;
    }
  }

  detectJobPosting(): boolean {
    return !!(
      this.querySelector('.posting-headline') ||
      this.querySelector('.postings-group') ||
      this.querySelector('[data-qa="job-title"]') ||
      this.querySelector('.posting-page')
    );
  }

  extractJobDescription(): JobDescription | null {
    const title =
      this.getElementText(this.querySelector<HTMLElement>('.posting-headline h2')) ||
      this.getElementText(this.querySelector<HTMLElement>('.posting-headline')) ||
      document.title;

    const company =
      this.getElementText(this.querySelector<HTMLElement>('.posting-headline .company-name')) ||
      this.querySelector<HTMLElement>('.logo img')?.getAttribute('alt') ||
      document.title.split(' - ').pop()?.trim() ||
      'Unknown Company';

    const descriptionSelectors = [
      '.section-wrapper .posting-description',
      '.posting-requirements',
      '.posting-description',
      '.content',
    ];

    let description = '';
    for (const selector of descriptionSelectors) {
      const element = this.querySelector<HTMLElement>(selector);
      const text = this.getElementText(element);
      if (text) {
        description = text;
        break;
      }
    }

    if (!description) {
      description = (document.body.innerText || document.body.textContent || '')
        .trim()
        .slice(0, 5000);
    }

    if (!description) {
      return null;
    }

    return {
      title,
      company,
      description,
      url: window.location.href,
    };
  }

  findFormFields(): FormField[] {
    const fields: FormField[] = [];
    const inputs = this.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'form input, form textarea, form select'
    );

    for (const input of inputs) {
      if (['hidden', 'submit', 'file', 'password', 'checkbox', 'radio'].includes(input.type) || input.disabled) {
        continue;
      }

      const id = input.id || input.name || '';
      if (!id) continue;

      const label = this.getElementText(input.labels?.[0] ?? null) || id;

      const type = input.tagName === 'TEXTAREA'
        ? 'textarea'
        : input.tagName === 'SELECT'
        ? 'select'
        : input.type || 'text';

      const required = input.required || input.getAttribute('aria-required') === 'true';

      fields.push({
        id,
        label,
        type,
        required,
      });
    }

    return fields;
  }

  fillField(fieldId: string, value: string): boolean {
    const element = this.findFormControl(fieldId);

    if (!element) {
      return false;
    }

    if (element.value.trim() || element.disabled || ('readOnly' in element && element.readOnly)) {
      return false;
    }

    if (element instanceof HTMLSelectElement) {
      this.setSelectValue(element, value);
      return Boolean(element.value);
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      this.setInputValue(element, value);
    }

    return true;
  }
}
