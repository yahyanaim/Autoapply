import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 text-gray-900">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-medium text-primary-600">
          ← ApplyAI
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">Terms of Use</h1>
        <p className="mt-2 text-sm text-gray-500">Effective July 25, 2026</p>
        <div className="mt-8 space-y-8 text-sm leading-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Assistive service</h2>
            <p className="mt-2">
              ApplyAI helps you analyze job descriptions, prepare application
              materials, fill supported fields, and track applications. You must
              review all generated or filled content and personally decide
              whether to submit it.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">No unattended submission</h2>
            <p className="mt-2">
              The extension does not submit applications automatically. You are
              responsible for complying with each job platform&apos;s rules and
              for the accuracy and lawfulness of content you provide or submit.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">AI limitations</h2>
            <p className="mt-2">
              AI output can be incomplete or incorrect. ApplyAI includes
              fabrication checks, but those checks cannot guarantee accuracy.
              Verify facts, dates, qualifications, and claims before use.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Account use</h2>
            <p className="mt-2">
              Keep account credentials secure, do not evade usage controls, and
              do not use ApplyAI to misrepresent identity or qualifications,
              interfere with services, or violate applicable law.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">Launch review</h2>
            <p className="mt-2">
              The production operator must have counsel finalize operator
              identity, governing law, payment, warranty, liability, dispute,
              cancellation, and jurisdiction-specific terms before public launch.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
