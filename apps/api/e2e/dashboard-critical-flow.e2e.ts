import { expect, Page, Route, test } from '@playwright/test';

const apiUrl = (
  process.env.E2E_DASHBOARD_API_URL || 'http://127.0.0.1:3001'
).replace(/\/$/, '');
const now = '2026-07-29T10:00:00.000Z';

const user = {
  id: 'e2e-user',
  email: 'sara.e2e@example.com',
  role: 'user',
  isEmailVerified: true,
  profile: { fullName: 'Sara Amrani' },
};

const resume = {
  id: 'e2e-resume',
  userId: user.id,
  originalFileUrl: '/uploads/e2e-resume.pdf',
  parsedJson: {
    skills: ['SQL', 'Power BI'],
    experience: [],
    education: [],
    projects: [],
    languages: ['French', 'English'],
    certifications: [],
  },
  parseStatus: 'ready',
  parseError: null,
  isPrimary: true,
  fileName: 'sara-amrani.pdf',
  fileSize: 32_000,
  mimeType: 'application/pdf',
  createdAt: now,
  updatedAt: now,
};

const job = {
  id: 'e2e-job',
  source: 'approved-ats',
  sourceUrl: 'https://jobs.example.com/data-analyst',
  title: 'Data Analyst',
  description:
    'Build Power BI dashboards and analyze operational data with SQL.',
  location: 'Casablanca',
  remoteType: 'hybrid',
  salaryMin: null,
  salaryMax: null,
  createdAt: now,
  company: { id: 'e2e-company', name: 'Atlas Data' },
  skills: [
    { id: 'sql', name: 'SQL' },
    { id: 'power-bi', name: 'Power BI' },
  ],
};

const generatedDocument = {
  template: 'classic-ats-v1',
  contact: {
    fullName: 'Sara Amrani',
    email: user.email,
    location: 'Casablanca',
  },
  profile: 'Data analyst focused on reliable operational reporting.',
  experience: [
    {
      title: 'Data Analyst',
      company: 'Current Employer',
      startDate: '2023',
      endDate: 'Present',
      description: 'Built recurring operational dashboards.',
      highlights: ['Automated verified data-quality checks'],
    },
  ],
  education: [],
  skills: ['SQL', 'Power BI'],
  projects: [],
  certifications: [],
  languages: ['French', 'English'],
};

function applicationFixture() {
  return {
    id: 'e2e-application',
    userId: user.id,
    jobId: job.id,
    sourceResumeId: resume.id,
    resumeVersionId: 'e2e-version',
    coverLetterId: 'e2e-letter',
    status: 'draft',
    preparationStatus: 'ready_for_review',
    jobAnalysis: {
      summary: 'The role needs operational reporting and data-quality skills.',
      responsibilities: ['Build dashboards', 'Analyze operational data'],
      requiredSkills: ['SQL', 'Power BI'],
      preferredSkills: [],
      experienceLevel: 'Mid-level',
      education: [],
      languages: ['French'],
      keywords: ['SQL', 'Power BI', 'data quality'],
    },
    generationError: null,
    approvedAt: null,
    appliedAt: null,
    timeline: [
      {
        type: 'workflow',
        timestamp: now,
        note: 'Optimized CV and cover letter are ready for review',
      },
    ],
    createdAt: now,
    updatedAt: now,
    truthfulness: {
      status: 'passed',
      summary: {
        supported: 4,
        safe_rewording: 1,
        needs_confirmation: 0,
        unsupported_blocked: 0,
      },
      findings: [],
    },
    job,
    resumeVersion: {
      id: 'e2e-version',
      resumeId: resume.id,
      optimizedText: 'Verified optimized resume',
      documentJson: generatedDocument,
      matchScore: 88,
      missingKeywords: ['Tableau'],
      weakSections: [],
      generatedAt: now,
    },
    coverLetter: {
      id: 'e2e-letter',
      content:
        'Dear Atlas Data team, my verified SQL and Power BI experience aligns with this role.',
      tone: 'professional',
      generatedAt: now,
      updatedAt: now,
    },
  };
}

test('register, upload a CV, select a scored job, and approve the package', async ({
  page,
}) => {
  let uploaded = false;
  let application = applicationFixture();
  await mockApi(page, {
    get uploaded() {
      return uploaded;
    },
    set uploaded(value: boolean) {
      uploaded = value;
    },
    get application() {
      return application;
    },
    set application(value: ReturnType<typeof applicationFixture>) {
      application = value;
    },
  });

  await page.goto('/register');
  await page.getByLabel('Full name').fill('Sara Amrani');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('StrongPassword1!');
  await page.getByLabel('Confirm password').fill('StrongPassword1!');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('link', { name: 'Upload Resume' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'sara-amrani.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mocked browser test'),
  });
  await expect(page.getByText('sara-amrani.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Find matching jobs' }).click();

  await page.getByRole('button', { name: 'Find my 20 best matches' }).click();
  await expect(
    page.getByRole('meter', { name: 'Match score: 88%' }),
  ).toBeVisible();
  await expect(page.getByText('Why this score?')).toBeVisible();
  await page.getByRole('button', { name: 'Select this job' }).click();
  await page.getByRole('button', { name: 'Prepare selected job' }).click();

  await expect(page).toHaveURL(/\/applications\/e2e-application$/);
  await expect(
    page.getByRole('heading', { name: 'Review every claim' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Review every claim' })
      .locator('..')
      .locator('textarea'),
  ).toHaveValue(
    'Dear Atlas Data team, my verified SQL and Power BI experience aligns with this role.',
  );
  await expect(
    page.getByRole('article', { name: 'CV preview for Sara Amrani' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve application package' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Package approved. It is ready for extension-assisted submission.',
  );
});

interface MockState {
  uploaded: boolean;
  application: ReturnType<typeof applicationFixture>;
}

async function mockApi(page: Page, state: MockState) {
  await page.route(`${apiUrl}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/auth/refresh') {
      return json(route, 401, { message: 'No active session' });
    }
    if (path === '/auth/register' && method === 'POST') {
      return json(route, 201, { accessToken: 'e2e-access-token', user });
    }
    if (path === '/auth/profile') return json(route, 200, user);
    if (path === '/resumes' && method === 'POST') {
      state.uploaded = true;
      return json(route, 201, resume);
    }
    if (path === '/resumes' && method === 'GET') {
      return json(route, 200, state.uploaded ? [resume] : []);
    }
    if (path === '/jobs/search') {
      return json(route, 200, { jobs: [job], total: 1, page: 1, limit: 20 });
    }
    if (path === '/jobs/discover' && method === 'POST') {
      expect(request.headers()['idempotency-key']).toMatch(
        /^discover:[0-9a-f-]{36}$/,
      );
      return json(route, 200, {
        resumeId: resume.id,
        generatedAt: now,
        requestedLimit: 20,
        totalCandidates: 1,
        searchProfile: { roles: ['Data Analyst'], skills: ['SQL', 'Power BI'] },
        filters: { query: null, location: null, remoteType: null },
        discoveryUsage: {
          used: 1,
          maximum: 50,
          remaining: 49,
          unlimited: false,
          resetAt: '2026-08-01T00:00:00.000Z',
        },
        scoreCache: { hits: 0, misses: 1 },
        sourceRefresh: [],
        jobs: [
          {
            ...job,
            matchScore: 88,
            matchConfidence: 92,
            scoreBreakdown: {
              skills: 100,
              experience: 75,
              responsibilities: 80,
              education: null,
              languages: 100,
              certifications: null,
            },
            matchedKeywords: ['SQL', 'Power BI'],
            matchedResumeSkills: ['SQL', 'Power BI'],
            missingKeywords: ['Tableau'],
            weakSections: [],
            explanation: ['Strong alignment on SQL and Power BI'],
            trackedApplication: null,
          },
        ],
      });
    }
    if (path === '/billing/subscription') {
      return json(route, 200, {
        id: 'e2e-subscription',
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: null,
        stripeSubscriptionId: 'sub_e2e',
        payments: [],
      });
    }
    if (path === '/applications/prepare' && method === 'POST') {
      expect(request.headers()['idempotency-key']).toMatch(
        /^prepare:[0-9a-f-]{36}$/,
      );
      return json(route, 201, state.application);
    }
    if (path === '/applications/e2e-application/approve' && method === 'POST') {
      state.application = {
        ...state.application,
        preparationStatus: 'ready_to_submit',
        approvedAt: now,
      };
      return json(route, 200, state.application);
    }
    if (path === '/applications/e2e-application') {
      return json(route, 200, state.application);
    }
    if (path === '/applications') {
      return json(route, 200, {
        applications: [],
        total: 0,
        page: 1,
        limit: 5,
      });
    }
    if (path === '/ai/usage') {
      return json(route, 200, {
        totalRequests: 0,
        totalCost: 0,
        totalTokens: 0,
        quota: {
          aiRequestsUsed: 0,
          aiRequestsMax: 50,
          resumeOptimizationsUsed: 0,
          resumeOptimizationsMax: 50,
          resetAt: '2026-08-01T00:00:00.000Z',
        },
      });
    }

    return json(route, 404, {
      message: `Unmocked ${method} ${path}`,
    });
  });
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
