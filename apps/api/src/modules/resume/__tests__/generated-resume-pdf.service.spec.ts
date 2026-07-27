import { PdfParser } from '../infrastructure/parsers/pdf.parser';
import { GeneratedResumePdfService } from '../infrastructure/pdf/generated-resume-pdf.service';
import { GeneratedResumeDocument } from '../domain/generated-resume';

const document: GeneratedResumeDocument = {
  template: 'classic-ats-v1',
  contact: {
    fullName: 'Daniel Carter',
    email: 'daniel.carter@example.com',
    phone: '+1 415 555 2874',
    location: 'Austin, Texas, USA',
    linkedInUrl: 'https://linkedin.com/in/danielcarterdev',
    portfolioUrl: 'https://github.com/danielcarterdev',
  },
  profile:
    'Senior Software Engineer with experience designing scalable web applications and distributed systems.',
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Example Payments',
      startDate: '2022-01',
      endDate: 'Present',
      description: 'Led development of payment infrastructure serving daily transactions.',
      highlights: [
        'Designed services using Node.js, Go, and Kubernetes',
        'Improved deployment workflows through CI/CD automation',
      ],
    },
  ],
  education: [
    {
      degree: 'Bachelor of Science in Computer Science',
      institution: 'University of Texas at Austin',
      startDate: '2011',
      endDate: '2015',
    },
  ],
  skills: ['JavaScript', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
  projects: [],
  certifications: [],
  languages: ['English'],
};

describe('GeneratedResumePdfService', () => {
  it('renders a readable ATS-style PDF with the expected sections', async () => {
    const buffer = await new GeneratedResumePdfService().render(document);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const text = await PdfParser.extractText(buffer);
    expect(text).toContain('Daniel Carter');
    expect(text).toContain('PROFESSIONAL EXPERIENCE');
    expect(text).toContain('TECHNICAL SKILLS');
    expect(text).toContain('Senior Software Engineer');
  }, 20_000);
});
