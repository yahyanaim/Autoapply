import type { FormField, JobDescription } from '../types';
import { BaseAdapter } from '../base.adapter';

export class GreenhouseAdapter extends BaseAdapter {
  name = 'greenhouse';

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'boards.greenhouse.io' || hostname === 'job-boards.greenhouse.io';
    } catch {
      return false;
    }
  }

  detectJobPosting(): boolean {
    return !!(
      this.querySelector('#content .job-post') ||
      this.querySelector('section.section--job-post') ||
      this.querySelector('[data-gh-job-post]') ||
      this.querySelector('form#application_form')
    );
  }

  extractJobDescription(): JobDescription | null {
    const title =
      this.getElementText(this.querySelector<HTMLElement>('.section-page-header h1')) ||
      this.getElementText(this.querySelector<HTMLElement>('h1')) ||
      document.title;

    const company =
      this.querySelector<HTMLElement>('.header-logo img')?.getAttribute('alt') ||
      this.getElementText(this.querySelector<HTMLElement>('.company-name')) ||
      'Unknown Company';

    const descriptionSelectors = [
      '.section--text .text',
      '#content .section--text',
      '.job__description',
      '#content .content',
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
    const form = this.querySelector<HTMLFormElement>('form#application_form');
    if (!form) return [];

    const fields: FormField[] = [];
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
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
    const form = this.querySelector<HTMLFormElement>('form#application_form');
    if (!form) return false;
    const element = this.findFormControl(fieldId, form);

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
