import type { FormField } from '../adapters/types';

export interface AutofillProfile {
  email: string;
  fullName: string;
  location: string;
  phone: string;
  linkedInUrl: string;
  portfolioUrl: string;
}

export function valueForField(
  field: FormField,
  profile: AutofillProfile,
): string {
  const identifier = `${field.id} ${field.label}`.toLowerCase().replace(/[_-]+/g, ' ');
  const names = profile.fullName.trim().split(/\s+/).filter(Boolean);
  if (field.type === 'email' || identifier.includes('email')) return profile.email;
  if (
    field.type === 'tel' ||
    identifier.includes('phone') ||
    identifier.includes('mobile')
  ) {
    return profile.phone;
  }
  if (identifier.includes('linkedin')) return profile.linkedInUrl;
  if (
    identifier.includes('portfolio') ||
    identifier.includes('personal website') ||
    identifier.includes('personal site')
  ) {
    return profile.portfolioUrl;
  }
  if (identifier.includes('first name') || identifier.includes('given name')) {
    return names[0] ?? '';
  }
  if (
    identifier.includes('last name') ||
    identifier.includes('family name') ||
    identifier.includes('surname')
  ) {
    return names.slice(1).join(' ') || names[0] || '';
  }
  if (
    identifier.includes('full name') ||
    identifier.includes('your name') ||
    ['name', 'applicant name'].includes(field.id.toLowerCase())
  ) {
    return profile.fullName;
  }
  if (identifier.includes('location') || identifier.includes('city')) {
    return profile.location;
  }
  return '';
}
