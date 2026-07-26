import type { FormField, JobDescription } from '../types';
import { BaseAdapter } from '../base.adapter';

export class AshbyAdapter extends BaseAdapter {
  name = 'ashby';

  canHandle(url: string): boolean {
    try {
      return new URL(url).hostname === 'jobs.ashbyhq.com';
    } catch {
      return false;
    }
  }

  detectJobPosting(): boolean {
    return !!(
      this.querySelector('[data-ashby-job-post]') ||
      this.querySelector('.ashby-job-posting') ||
      this.querySelector('h1.posting-name') ||
      this.querySelector('.job-posting')
    );
  }

  extractJobDescription(): JobDescription | null {
    const title =
      this.getElementText(this.querySelector<HTMLElement>('h1.posting-name')) ||
      this.getElementText(this.querySelector<HTMLElement>('h1')) ||
      document.title;

    const company =
      this.querySelector<HTMLElement>('.ashby-header-logo img')?.getAttribute('alt') ||
      this.getElementText(this.querySelector<HTMLElement>('.company-name')) ||
      'Unknown Company';

    const descriptionSelectors = [
      '.ashby-job-posting-description',
      '.posting-description',
      '.job-description',
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
