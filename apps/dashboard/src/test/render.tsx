import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export interface RenderedView {
  container: HTMLDivElement;
  cleanup: () => void;
  required: <T extends Element>(selector: string) => T;
}

export function renderView(ui: ReactNode): RenderedView {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    required: <T extends Element>(selector: string) => {
      const element = container.querySelector<T>(selector);
      if (!element) throw new Error(`Expected test element: ${selector}`);
      return element;
    },
  };
}

export function setFormValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function click(element: HTMLElement) {
  act(() => {
    element.click();
  });
}

export async function flushUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}
