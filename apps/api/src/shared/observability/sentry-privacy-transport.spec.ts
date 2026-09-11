import { createPrivacySafeTransport } from './sentry-privacy-transport';
import { sanitizeSentryEvent } from './sentry-sanitizer';

describe('createPrivacySafeTransport', () => {
  it('sends only a sanitized error event and drops all other envelope data', async () => {
    const sent: unknown[] = [];
    const transport = {
      send(envelope: unknown) {
        sent.push(envelope);
        return Promise.resolve({ status: 'success' });
      },
      flush() {
        return Promise.resolve(true);
      },
    };
    const privacySafeTransport = createPrivacySafeTransport(
      transport,
      sanitizeSentryEvent,
    );

    await privacySafeTransport.send([
      { dsn: 'https://public@example.com/123' },
      [
        [{ type: 'session' }, { user: { email: 'candidate@example.com' } }],
        [{ type: 'attachment', filename: 'resume.pdf' }, 'FULL_CV_CONTENT'],
        [{ type: 'client_report' }, { discarded_events: ['FULL_CV_CONTENT'] }],
        [{ type: 'profile' }, { profile: 'FULL_CV_CONTENT' }],
        [{ type: 'profile_chunk' }, { profile: 'FULL_CV_CONTENT' }],
        [{ type: 'replay_event' }, { segment: 'FULL_CV_CONTENT' }],
        [{ type: 'replay_recording' }, { segment: 'FULL_CV_CONTENT' }],
        [{ type: 'check_in' }, { monitor_slug: 'FULL_CV_CONTENT' }],
        [
          { type: 'event' },
          {
            extra: { prompt: 'PROMPT_TEXT' },
            exception: {
              values: [
                {
                  type: 'Jane.Doe',
                  value: 'candidate@example.com',
                  stacktrace: {
                    frames: [
                      {
                        filename: '/srv/resume.service.ts?token=ACCESS_TOKEN',
                        function: 'parseResume',
                        lineno: 20,
                        colno: 4,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
        [{ type: 'transaction' }, { transaction: 'FULL_CV_CONTENT' }],
        [{ type: 'statsd' }, { metric: 'FULL_CV_CONTENT' }],
      ],
    ]);

    expect(sent).toHaveLength(1);
    const serialized = JSON.stringify(sent[0]);
    for (const secret of [
      'candidate@example.com',
      'FULL_CV_CONTENT',
      'PROMPT_TEXT',
      'ACCESS_TOKEN',
      'resume.pdf',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(sent[0]).toEqual([
      {},
      [
        [
          { type: 'event' },
          {
            platform: 'node',
            level: 'error',
            exception: {
              values: [
                {
                  type: 'ApplyAIError',
                  stacktrace: {
                    frames: [
                      {
                        lineno: 20,
                        colno: 4,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      ],
    ]);
  });

  it('does not forward envelopes without an eligible error event', async () => {
    const send = jest.fn().mockResolvedValue({ status: 'success' });
    const transport = {
      send,
      flush: () => Promise.resolve(true),
    };
    const privacySafeTransport = createPrivacySafeTransport(
      transport,
      sanitizeSentryEvent,
    );

    await privacySafeTransport.send([
      {},
      [[{ type: 'session' }, { attrs: { email: 'candidate@example.com' } }]],
    ]);

    expect(send).not.toHaveBeenCalled();
  });
});
