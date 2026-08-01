import { expect, test } from '@playwright/test';
import PDFDocument from 'pdfkit';

test('paid staging account prepares and approves a complete application package', async ({
  request,
}) => {
  test.skip(
    !process.env.E2E_API_URL ||
      !process.env.E2E_PAID_EMAIL ||
      !process.env.E2E_PAID_PASSWORD,
    'Set E2E_API_URL, E2E_PAID_EMAIL, and E2E_PAID_PASSWORD for an isolated paid staging account',
  );

  const login = await request.post('/auth/login', {
    data: {
      email: process.env.E2E_PAID_EMAIL,
      password: process.env.E2E_PAID_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  let resumeId = '';
  let applicationId = '';

  try {
    const upload = await request.post('/resumes', {
      headers,
      multipart: {
        file: {
          name: 'applyai-staging-resume.pdf',
          mimeType: 'application/pdf',
          buffer: await buildResumePdf(),
        },
      },
    });
    expect(upload.status()).toBe(201);
    resumeId = (await upload.json()).id as string;

    await expect
      .poll(
        async () => {
          const response = await request.get(`/resumes/${resumeId}`, {
            headers,
          });
          return (await response.json()).parseStatus;
        },
        { timeout: 90_000 },
      )
      .toBe('ready');

    const discovery = await request.post('/jobs/discover', {
      headers: {
        ...headers,
        'Idempotency-Key': `e2e-discover:${crypto.randomUUID()}`,
      },
      data: { resumeId, limit: 20 },
    });
    expect(discovery.ok()).toBeTruthy();
    const job = (await discovery.json()).jobs[0];
    test.skip(
      !job,
      'The staging environment needs at least one complete indexed job',
    );

    const score = await request.post('/ai/match-score', {
      headers,
      data: { resumeId, jobId: job.id },
    });
    expect(score.ok()).toBeTruthy();
    expect((await score.json()).score).toBeGreaterThanOrEqual(0);

    const idempotencyKey = `e2e-prepare:${crypto.randomUUID()}`;
    const prepare = () =>
      request.post('/applications/prepare', {
        headers: {
          ...headers,
          'Idempotency-Key': idempotencyKey,
        },
        data: { resumeId, jobId: job.id },
      });
    const prepared = await prepare();
    expect(prepared.status()).toBe(201);
    const application = await prepared.json();
    applicationId = application.id as string;
    expect(application).toEqual(
      expect.objectContaining({
        preparationStatus: 'ready_for_review',
        resumeVersionId: expect.any(String),
        coverLetterId: expect.any(String),
        truthfulness: expect.objectContaining({
          status: expect.stringMatching(/passed|review_required/),
        }),
      }),
    );
    expect(application.resumeVersion?.documentJson).toBeTruthy();
    expect(application.coverLetter?.content).toEqual(expect.any(String));

    const retried = await prepare();
    expect(retried.status()).toBe(201);
    expect((await retried.json()).id).toBe(applicationId);

    const approval = await request.post(
      `/applications/${applicationId}/approve`,
      {
        headers,
        data: { confirmQuestionableClaims: true },
      },
    );
    expect(approval.ok()).toBeTruthy();
    expect((await approval.json()).preparationStatus).toBe('ready_to_submit');
  } finally {
    if (applicationId) {
      await request.delete(`/applications/${applicationId}`, { headers });
    }
    if (resumeId) {
      await request.delete(`/resumes/${resumeId}`, { headers });
    }
  }
});

function buildResumePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 54 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(20).text('Sara Amrani');
    document
      .fontSize(11)
      .text('sara.staging@example.com | Casablanca, Morocco');
    document.moveDown();
    document.fontSize(14).text('Professional Experience');
    document
      .fontSize(11)
      .text('Data Analyst — Atlas Data | 2023 – Present')
      .text('Built operational dashboards with SQL and Power BI.')
      .text('Automated recurring data-quality checks.');
    document.moveDown();
    document.fontSize(14).text('Skills');
    document.fontSize(11).text('SQL, Power BI, Excel, data quality');
    document.moveDown();
    document.fontSize(14).text('Languages');
    document.fontSize(11).text('Arabic, French, English');
    document.end();
  });
}
