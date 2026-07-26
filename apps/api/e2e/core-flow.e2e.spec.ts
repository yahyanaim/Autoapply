import { expect, test } from '@playwright/test';

test('signup to tracked application core journey', async ({ request }) => {
  test.skip(
    !process.env.E2E_API_URL,
    'Set E2E_API_URL to a migrated staging API with Redis, storage, and an AI provider',
  );

  const email = `e2e-${Date.now()}@example.com`;
  const registration = await request.post('/auth/register', {
    data: {
      email,
      password: 'EndToEndPass123!@',
      acceptDataProcessing: true,
    },
  });
  expect(registration.ok()).toBeTruthy();
  const { accessToken } = await registration.json();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  );
  const upload = await request.post('/resumes', {
    headers,
    multipart: {
      file: {
        name: 'e2e-resume.pdf',
        mimeType: 'application/pdf',
        buffer: pdf,
      },
    },
  });
  expect(upload.status()).toBe(201);
  const resume = await upload.json();

  await expect
    .poll(
      async () => {
        const response = await request.get(`/resumes/${resume.id}`, { headers });
        return (await response.json()).parseStatus;
      },
      { timeout: 90_000 },
    )
    .toBe('ready');

  const jobs = await request.get('/jobs/search?limit=1', { headers });
  expect(jobs.ok()).toBeTruthy();
  const job = (await jobs.json()).jobs[0];
  test.skip(!job, 'The E2E staging environment needs at least one indexed job');

  const score = await request.post('/ai/match-score', {
    headers,
    data: { resumeId: resume.id, jobId: job.id },
  });
  expect(score.ok()).toBeTruthy();
  expect((await score.json()).score).toBeGreaterThanOrEqual(0);

  const letter = await request.post('/ai/cover-letter', {
    headers,
    data: { resumeId: resume.id, jobId: job.id, tone: 'professional' },
  });
  expect(letter.ok()).toBeTruthy();

  const tracked = await request.post('/applications', {
    headers,
    data: {
      jobId: job.id,
      coverLetterId: (await letter.json()).id,
    },
  });
  expect(tracked.status()).toBe(201);
  expect((await tracked.json()).status).toBe('draft');
});
