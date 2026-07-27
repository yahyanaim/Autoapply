import { GeneratedResumeDocument } from '@/lib/api/hooks/use-resumes';
import { cn } from '@/lib/utils';

interface ClassicResumePreviewProps {
  document: GeneratedResumeDocument;
  className?: string;
}

export function ClassicResumePreview({
  document,
  className,
}: ClassicResumePreviewProps) {
  const contactItems = [
    document.contact.email,
    document.contact.phone,
    document.contact.location,
    displayUrl(document.contact.linkedInUrl),
    displayUrl(document.contact.portfolioUrl),
  ].filter(Boolean);

  return (
    <article
      aria-label={`CV preview for ${document.contact.fullName}`}
      className={cn(
        'mx-auto w-full max-w-[820px] bg-white px-6 py-8 font-serif text-[#171717] shadow-[0_18px_60px_rgba(20,20,20,0.12)] sm:px-12 sm:py-10',
        className,
      )}
    >
      <header className="text-center">
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
          {document.contact.fullName}
        </h2>
        <div className="my-3 border-t border-black/50" />
        <p className="mx-auto max-w-[720px] text-[11px] leading-5 text-gray-800 sm:text-xs">
          {contactItems.map((item, index) => (
            <span key={`${item}-${index}`}>
              {index > 0 && <span className="px-2 text-gray-400">|</span>}
              {item}
            </span>
          ))}
        </p>
        <div className="mt-3 border-t border-black/50" />
      </header>

      <ResumeSection title="Profile">
        <p className="text-[12px] leading-[1.55] text-gray-800 sm:text-[13px]">
          {document.profile}
        </p>
      </ResumeSection>

      {document.experience.length > 0 && (
        <ResumeSection title="Professional Experience">
          <div className="space-y-5">
            {document.experience.map((item, index) => (
              <div key={`${item.company}-${item.title}-${index}`}>
                <div className="flex items-start justify-between gap-5">
                  <h3 className="text-[12px] font-bold leading-5 sm:text-[13px]">
                    {item.title}
                    <span className="font-normal italic"> - {item.company}</span>
                  </h3>
                  <p className="shrink-0 pt-0.5 text-[10px] text-gray-600 sm:text-[11px]">
                    {item.startDate} - {item.endDate}
                  </p>
                </div>
                {item.description && (
                  <p className="mt-1 text-[11px] leading-[1.5] text-gray-800 sm:text-[12px]">
                    {item.description}
                  </p>
                )}
                {item.highlights.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] leading-[1.45] text-gray-800 sm:text-[12px]">
                    {item.highlights.map((highlight, highlightIndex) => (
                      <li key={`${highlight}-${highlightIndex}`}>{highlight}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </ResumeSection>
      )}

      {document.education.length > 0 && (
        <ResumeSection title="Education">
          <div className="space-y-3">
            {document.education.map((item, index) => (
              <div key={`${item.institution}-${item.degree}-${index}`}>
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h3 className="text-[12px] font-bold leading-5 sm:text-[13px]">
                      {item.degree}
                    </h3>
                    <p className="text-[11px] italic text-gray-700 sm:text-[12px]">
                      {item.institution}
                    </p>
                  </div>
                  <p className="shrink-0 pt-0.5 text-[10px] text-gray-600 sm:text-[11px]">
                    {item.startDate} - {item.endDate}
                  </p>
                </div>
                {item.gpa && (
                  <p className="text-[10px] text-gray-600 sm:text-[11px]">
                    GPA: {item.gpa}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ResumeSection>
      )}

      {document.skills.length > 0 && (
        <ResumeSection title="Technical Skills">
          <p className="text-[11px] leading-6 text-gray-800 sm:text-[12px]">
            {document.skills.join('  •  ')}
          </p>
        </ResumeSection>
      )}

      {document.projects.length > 0 && (
        <ResumeSection title="Projects">
          <div className="space-y-4">
            {document.projects.map((project, index) => (
              <div key={`${project.name}-${index}`}>
                <h3 className="text-[12px] font-bold sm:text-[13px]">{project.name}</h3>
                <p className="mt-0.5 text-[11px] leading-[1.5] text-gray-800 sm:text-[12px]">
                  {project.description}
                </p>
                {(project.technologies.length > 0 || project.url) && (
                  <p className="mt-1 text-[10px] text-gray-500 sm:text-[11px]">
                    {[project.technologies.join(' | '), displayUrl(project.url)]
                      .filter(Boolean)
                      .join('  |  ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ResumeSection>
      )}

      {document.certifications.length > 0 && (
        <ResumeSection title="Certifications">
          <ul className="list-disc space-y-1 pl-5 text-[11px] text-gray-800 sm:text-[12px]">
            {document.certifications.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </ResumeSection>
      )}

      {document.languages.length > 0 && (
        <ResumeSection title="Languages">
          <p className="text-[11px] text-gray-800 sm:text-[12px]">
            {document.languages.join('  |  ')}
          </p>
        </ResumeSection>
      )}
    </article>
  );
}

function ResumeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.13em] sm:text-[13px]">
        {title}
      </h2>
      <div className="mb-2 mt-2 border-t border-black/20" />
      {children}
    </section>
  );
}

function displayUrl(value?: string): string | undefined {
  return value?.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
