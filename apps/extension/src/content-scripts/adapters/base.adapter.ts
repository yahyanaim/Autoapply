import type { FormField, JobDescription, JobPageAdapter } from './types';

export abstract class BaseAdapter implements JobPageAdapter {
  abstract name: string;

  abstract canHandle(url: string): boolean;
  abstract detectJobPosting(): boolean;
  abstract extractJobDescription(): JobDescription | null;
  abstract findFormFields(): FormField[];
  abstract fillField(fieldId: string, value: string): boolean;

  protected querySelector<T extends HTMLElement>(selector: string): T | null {
    return document.querySelector<T>(selector);
  }

  protected querySelectorAll<T extends HTMLElement>(selector: string): T[] {
    return Array.from(document.querySelectorAll<T>(selector));
  }

  protected findFormControl(
    fieldId: string,
    root: ParentNode = document,
  ): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    const selector = root instanceof HTMLFormElement
      ? 'input, textarea, select'
      : 'form input, form textarea, form select';
    return Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector),
    ).find((element) => element.id === fieldId || element.name === fieldId) ?? null;
  }

  protected waitForElement(
    selector: string,
    timeout: number = 5000
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected getElementText(element: HTMLElement | null): string {
    return (element?.innerText || element?.textContent || '').trim();
  }

  protected getFieldValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    return element.value;
  }

  protected setInputValue(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ): void {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  protected setSelectValue(element: HTMLSelectElement, value: string): void {
    const normalized = value.trim().toLowerCase();
    const option = Array.from(element.options).find(
      (candidate) =>
        candidate.value.toLowerCase() === normalized ||
        candidate.text.trim().toLowerCase() === normalized,
    );
    if (!option) return;
    element.value = option.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
