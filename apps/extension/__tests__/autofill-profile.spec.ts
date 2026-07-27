import { describe, expect, it } from 'vitest';
import {
  AutofillProfile,
  valueForField,
} from '../src/content-scripts/core/autofill-profile';

const profile: AutofillProfile = {
  email: 'candidate@example.com',
  fullName: 'Yahya Naim',
  location: 'Casablanca',
  phone: '+212 600 000 000',
  linkedInUrl: 'https://www.linkedin.com/in/yahya-naim',
  portfolioUrl: 'https://example.dev',
};

describe('safe autofill profile mapping', () => {
  it.each([
    ['first_name', 'First name', 'text', 'Yahya'],
    ['last_name', 'Last name', 'text', 'Naim'],
    ['email', 'Email address', 'email', 'candidate@example.com'],
    ['mobile_phone', 'Mobile phone', 'tel', '+212 600 000 000'],
    ['linkedin_url', 'LinkedIn profile', 'url', 'https://www.linkedin.com/in/yahya-naim'],
    ['portfolio', 'Portfolio', 'url', 'https://example.dev'],
    ['city', 'Current city', 'text', 'Casablanca'],
  ])('maps %s without guessing', (id, label, type, expected) => {
    expect(
      valueForField(
        { id, label, type, required: false },
        profile,
      ),
    ).toBe(expected);
  });

  it('does not answer unsupported or sensitive questions', () => {
    expect(
      valueForField(
        {
          id: 'sponsorship',
          label: 'Will you require visa sponsorship?',
          type: 'select',
          required: true,
        },
        profile,
      ),
    ).toBe('');
  });
});
