'use client';

import Markdown from 'react-markdown';

/** Only owner-approved, credential-free HTTPS sources may become navigation. */
export function safeCareerChatUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Match the owning service's URL identity, not a hostname or decoded prefix. */
function sourceIdentity(value: string): string | null {
  const safeUrl = safeCareerChatUrl(value);
  if (!safeUrl) return null;
  const url = new URL(safeUrl);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function CareerChatAnswer({
  content,
  sources = [],
}: {
  content: string;
  sources?: string[];
}) {
  const allowed = new Set(
    sources
      .map(sourceIdentity)
      .filter((identity): identity is string => identity !== null),
  );
  const safeLink = (href: string) => {
    const url = safeCareerChatUrl(href);
    const identity = url ? sourceIdentity(url) : null;
    // Compare canonical identity but retain safe fragments for navigation.
    return url && identity !== null && allowed.has(identity) ? url : '';
  };
  return (
    <div
      dir="auto"
      className="min-w-0 text-start leading-relaxed [overflow-wrap:anywhere]"
    >
      {/* With no rehype-raw, raw markup becomes escaped React text. Dropping it
          would silently remove technical prose such as List<T>. */}
      <Markdown
        skipHtml={false}
        allowedElements={[
          'p',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'code',
          'pre',
          'a',
          'br',
          'blockquote',
        ]}
        unwrapDisallowed
        urlTransform={(url) => safeLink(url)}
        components={{
          p: ({ children }) => (
            <p dir="auto" className="my-2 first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h3
              dir="auto"
              className="mb-1 mt-3 text-sm font-semibold first:mt-0"
            >
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3
              dir="auto"
              className="mb-1 mt-3 text-sm font-semibold first:mt-0"
            >
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 dir="auto" className="mb-1 mt-3 font-semibold first:mt-0">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h4 dir="auto" className="mb-1 mt-3 font-semibold first:mt-0">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h4 dir="auto" className="mb-1 mt-3 font-semibold first:mt-0">
              {children}
            </h4>
          ),
          h6: ({ children }) => (
            <h4 dir="auto" className="mb-1 mt-3 font-semibold first:mt-0">
              {children}
            </h4>
          ),
          ul: ({ children }) => (
            <ul dir="auto" className="my-2 list-disc space-y-1 ps-5">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir="auto" className="my-2 list-decimal space-y-1 ps-5">
              {children}
            </ol>
          ),
          li: ({ children }) => <li dir="auto">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-950">{children}</strong>
          ),
          pre: ({ children }) => (
            <pre
              dir="ltr"
              className="my-2 max-w-full overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-left text-xs"
            >
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code
              dir="ltr"
              className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.75rem] [unicode-bidi:isolate]"
            >
              {children}
            </code>
          ),
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-medium text-orange-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          blockquote: ({ children }) => (
            <blockquote
              dir="auto"
              className="my-2 border-s-2 border-orange-200 ps-3 text-gray-600"
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
