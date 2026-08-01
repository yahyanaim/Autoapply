import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';
import {
  click,
  flushUpdates,
  renderView,
  RenderedView,
  setFormValue,
} from './render';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/api/hooks/use-auth', () => ({
  useAuth: () => ({
    login: mocks.login,
    register: mocks.register,
  }),
}));

vi.mock('@/components/brand/ApplyAILogo', () => ({
  ApplyAILogo: () => <span>ApplyAI</span>,
}));

let view: RenderedView | undefined;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  window.sessionStorage.clear();
});

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe('authentication pages', () => {
  it('blocks an invalid login before calling the API', async () => {
    view = renderView(<LoginPage />);
    view.required<HTMLFormElement>('form').noValidate = true;

    setFormValue(view.required<HTMLInputElement>('#email'), 'not-an-email');
    setFormValue(view.required<HTMLInputElement>('#password'), '');
    setFormValue(
      view.required<HTMLInputElement>(
        '#authenticator-code-\\(administrators\\)',
      ),
      '12',
    );
    click(view.required<HTMLButtonElement>('button[type="submit"]'));
    await flushUpdates();

    expect(mocks.login).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('Please enter a valid email');
    expect(view.container.textContent).toContain('Password is required');
    expect(view.container.textContent).toContain(
      'Authenticator code must contain 6 digits',
    );
  });

  it('submits credentials and keeps the selected paid plan destination', async () => {
    window.history.replaceState({}, '', '/login?plan=pro');
    mocks.login.mockResolvedValue(undefined);
    view = renderView(<LoginPage />);
    await flushUpdates();

    setFormValue(
      view.required<HTMLInputElement>('#email'),
      'member@example.com',
    );
    setFormValue(
      view.required<HTMLInputElement>('#password'),
      'ValidPass123!@',
    );
    setFormValue(
      view.required<HTMLInputElement>(
        '#authenticator-code-\\(administrators\\)',
      ),
      '123456',
    );
    click(view.required<HTMLButtonElement>('button[type="submit"]'));
    await flushUpdates();

    expect(mocks.login).toHaveBeenCalledWith(
      'member@example.com',
      'ValidPass123!@',
      '123456',
    );
    expect(mocks.push).toHaveBeenCalledWith('/billing?plan=pro');
  });

  it('requires matching strong passwords and explicit data consent', async () => {
    view = renderView(<RegisterPage />);

    setFormValue(view.required<HTMLInputElement>('#full-name'), 'A');
    setFormValue(
      view.required<HTMLInputElement>('#email'),
      'member@example.com',
    );
    setFormValue(view.required<HTMLInputElement>('#password'), 'weak');
    setFormValue(
      view.required<HTMLInputElement>('#confirm-password'),
      'different',
    );
    click(view.required<HTMLButtonElement>('button[type="submit"]'));
    await flushUpdates();

    expect(mocks.register).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain(
      'Name must be at least 2 characters',
    );
    expect(view.container.textContent).toContain('Use at least 12 characters');
    expect(view.container.textContent).toContain('Passwords do not match');
    expect(view.container.textContent).toContain(
      'Consent is required to create an account',
    );
  });

  it('creates an account only after consent and routes to the dashboard', async () => {
    mocks.register.mockResolvedValue(undefined);
    view = renderView(<RegisterPage />);

    setFormValue(view.required<HTMLInputElement>('#full-name'), 'Sara Amrani');
    setFormValue(view.required<HTMLInputElement>('#email'), 'sara@example.com');
    setFormValue(
      view.required<HTMLInputElement>('#password'),
      'StrongPassword1!',
    );
    setFormValue(
      view.required<HTMLInputElement>('#confirm-password'),
      'StrongPassword1!',
    );
    click(view.required<HTMLInputElement>('input[type="checkbox"]'));
    click(view.required<HTMLButtonElement>('button[type="submit"]'));
    await flushUpdates();

    expect(mocks.register).toHaveBeenCalledWith(
      'Sara Amrani',
      'sara@example.com',
      'StrongPassword1!',
      true,
    );
    expect(mocks.push).toHaveBeenCalledWith('/dashboard');
  });
});
