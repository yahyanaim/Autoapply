import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 text-gray-900">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-medium text-primary-600">
          ← ApplyAI
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">Privacy Notice</h1>
        <p className="mt-2 text-sm text-gray-500">Effective July 25, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">What we process</h2>
            <p className="mt-2">
              ApplyAI processes account details, profile information, resumes,
              job and application records, generated content, product activity,
              billing status, and security/session metadata needed to provide
              and protect the service.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Resume and AI processing</h2>
            <p className="mt-2">
              Resume storage and provider-backed AI features require explicit
              consent. When you request an AI feature, ApplyAI sends only the
              content needed for that request to the configured AI provider.
              You can review your consent status in Settings.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Service providers</h2>
            <p className="mt-2">
              Depending on deployment configuration, processors may include
              Amazon Web Services for hosting and storage, Stripe for billing,
              and OpenAI, Anthropic, or Google for requested AI features. ApplyAI
              does not sell personal data.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Your controls</h2>
            <p className="mt-2">
              Settings lets you download a portable JSON export, review active
              sessions, revoke access, and permanently delete your account and
              stored resume files. Deletion also cancels an active subscription.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Security and retention</h2>
            <p className="mt-2">
              ApplyAI uses access controls, encryption in transit, encrypted
              production object storage, short-lived access tokens, rotating
              sessions, and security audit records. Data is retained while your
              account is active and as necessary for security, billing, dispute,
              and legal obligations.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p className="mt-2">
              Privacy requests can be sent to{' '}
              <a href="mailto:privacy@applyai.com" className="font-medium text-primary-600">
                privacy@applyai.com
              </a>
              . The production operator must publish its legal name, address,
              applicable retention schedule, and jurisdiction-specific notices
              before public launch.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
