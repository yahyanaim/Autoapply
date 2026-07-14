import React from "react";
import { Candidate } from "../types";

interface PDFPreviewProps {
  candidate?: Candidate;
  markdownText?: string;
  title?: string;
  jobTitle?: string;
  companyName?: string;
}

export const PDFPreview: React.FC<PDFPreviewProps> = ({
  candidate,
  markdownText,
  title = "Curriculum Vitae",
  jobTitle,
  companyName
}) => {
  const contentRef = React.useRef<HTMLDivElement>(null);

  const parsedMarkdown = React.useMemo(() => {
    if (!markdownText) return null;
    const lines = markdownText.split("\n");
    let currentSection = "";
    const sections: { [key: string]: string[] } = {
      header: [], summary: [], experience: [], education: [], skills: [], other: []
    };
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("# ")) {
        sections.header.push(trimmed.replace("# ", ""));
      } else if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
        const secTitle = trimmed.replace(/^##+\s+/, "").toLowerCase();
        if (secTitle.includes("expéri") || secTitle.includes("work") || secTitle.includes("parcours")) currentSection = "experience";
        else if (secTitle.includes("éduc") || secTitle.includes("formati") || secTitle.includes("etud")) currentSection = "education";
        else if (secTitle.includes("compét") || secTitle.includes("skills") || secTitle.includes("techno")) currentSection = "skills";
        else if (secTitle.includes("résum") || secTitle.includes("profil") || secTitle.includes("intro") || secTitle.includes("summar")) currentSection = "summary";
        else currentSection = "other";
      } else {
        if (!currentSection) sections.header.push(line);
        else sections[currentSection].push(line);
      }
    });
    return sections;
  }, [markdownText]);

  const S: Record<string, React.CSSProperties> = {
    page: { width: '210mm', minHeight: '297mm', background: '#fff', fontFamily: "'Source Serif 4', 'Latin Modern Roman', Georgia, 'Times New Roman', serif", color: '#1a1a1a', padding: '18mm 20mm', lineHeight: 1.4 },
    name: { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '28px', fontWeight: 700, textAlign: 'center' as const, letterSpacing: '0.02em', marginBottom: '4px', color: '#000' },
    jobtitle: { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '11px', fontWeight: 400, textAlign: 'center' as const, color: '#444', textTransform: 'uppercase' as const, letterSpacing: '0.18em', marginBottom: '8px' },
    contactRow: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap' as const, gap: '4px 16px', fontSize: '9px', color: '#333', marginBottom: '4px', textAlign: 'center' as const },
    contactItem: {},
    contactSep: { color: '#bbb', margin: '0 2px' },
    rule: { border: 'none', borderTop: '1px solid #1a1a1a', margin: '8px 0 10px 0' },
    ruleThin: { border: 'none', borderTop: '0.5px solid #ccc', margin: '4px 0 6px 0' },
    sectionTitle: { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.14em', color: '#000', marginBottom: '6px', marginTop: '12px' },
    expBlock: { marginBottom: '10px', pageBreakInside: 'avoid' as const },
    expRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
    expRole: { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '10.5px', fontWeight: 700, color: '#000' },
    expCompany: { fontSize: '10px', fontWeight: 400, color: '#333', fontStyle: 'italic' as const },
    expDate: { fontSize: '9px', color: '#666', whiteSpace: 'nowrap' as const },
    expDesc: { fontSize: '9.5px', color: '#333', lineHeight: 1.5, textAlign: 'justify' as const, marginTop: '2px' },
    expList: { fontSize: '9px', color: '#333', lineHeight: 1.45, paddingLeft: '14px', marginTop: '2px', listStyleType: 'disc' as const },
    expTech: { fontSize: '8px', color: '#888', marginTop: '2px' },
    eduRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
    eduDegree: { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: '10px', fontWeight: 700, color: '#000' },
    eduField: { fontSize: '9.5px', color: '#333' },
    eduSchool: { fontSize: '9px', color: '#555', fontStyle: 'italic' as const },
    eduDate: { fontSize: '9px', color: '#666' },
    summary: { fontSize: '9.5px', color: '#333', lineHeight: 1.55, textAlign: 'justify' as const },
    skillsRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '3px 8px' },
    skillTag: { fontSize: '9px', color: '#333' },
    skillDot: { display: 'inline-block', width: '3px', height: '3px', borderRadius: '50%', background: '#999', verticalAlign: 'middle', marginRight: '5px' },
  };

  const handleDownloadPDF = () => {
    const htmlContent = contentRef.current?.innerHTML || "";
    const fullHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Source Serif 4', Georgia, serif; color: #1a1a1a; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
</style></head><body>${htmlContent}</body></html>`;
    const blob = new Blob([fullHTML], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) { w.addEventListener("load", () => setTimeout(() => w.print(), 800)); }
    else { const a = document.createElement("a"); a.href = url; a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.html`; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
      <div style={S.sectionTitle}>{title}</div>
      <hr style={S.ruleThin} />
      {children}
    </div>
  );

  const renderStructuredCandidate = (cand: Candidate) => (
    <div style={S.page}>
      {/* Name */}
      <div style={S.name}>{cand.name}</div>
      {jobTitle && <div style={S.jobtitle}>{jobTitle}</div>}
      <hr style={S.rule} />

      {/* Contact */}
      <div style={S.contactRow}>
        {cand.email && <span style={S.contactItem}>{cand.email}</span>}
        {cand.phone && <><span style={S.contactSep}>·</span><span style={S.contactItem}>{cand.phone}</span></>}
        {cand.location && <><span style={S.contactSep}>·</span><span style={S.contactItem}>{cand.location}</span></>}
        {cand.linkedinUrl && <><span style={S.contactSep}>·</span><span style={S.contactItem}>{cand.linkedinUrl.replace('https://', '')}</span></>}
        {cand.githubUrl && <><span style={S.contactSep}>·</span><span style={S.contactItem}>{cand.githubUrl.replace('https://', '')}</span></>}
      </div>
      <hr style={S.rule} />

      {/* Summary */}
      {cand.summary && (
        <Section title="Profile">
          <p style={S.summary}>{cand.summary}</p>
        </Section>
      )}

      {/* Experience */}
      {cand.workExperience && cand.workExperience.length > 0 && (
        <Section title="Professional Experience">
          {cand.workExperience.map((exp) => (
            <div key={exp.id} style={S.expBlock}>
              <div style={S.expRow}>
                <div>
                  <span style={S.expRole}>{exp.title}</span>
                  <span style={S.expCompany}> — {exp.company}</span>
                </div>
                <span style={S.expDate}>{exp.startDate} – {exp.isCurrent ? "Present" : exp.endDate}</span>
              </div>
              {exp.description && <p style={S.expDesc}>{exp.description}</p>}
              {exp.achievements && exp.achievements.length > 0 && (
                <ul style={S.expList}>
                  {exp.achievements.map((ach, i) => <li key={i} style={{ marginBottom: 1 }}>{ach}</li>)}
                </ul>
              )}
              {exp.technologies && exp.technologies.length > 0 && (
                <div style={S.expTech}>{exp.technologies.join(' · ')}</div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Education */}
      {cand.education && cand.education.length > 0 && (
        <Section title="Education">
          {cand.education.map((edu) => (
            <div key={edu.id} style={{ marginBottom: 6 }}>
              <div style={S.eduRow}>
                <div>
                  <span style={S.eduDegree}>{edu.degree}</span>
                  <span style={S.eduField}> in {edu.fieldOfStudy}</span>
                </div>
                <span style={S.eduDate}>{edu.startYear} – {edu.endYear || "Present"}</span>
              </div>
              <div style={S.eduSchool}>{edu.institution}</div>
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {cand.skills && cand.skills.length > 0 && (
        <Section title="Technical Skills">
          <div style={S.skillsRow}>
            {cand.skills.map((sk, i) => (
              <span key={i} style={S.skillTag}>
                <span style={S.skillDot} />
                {sk.skillName} ({sk.proficiency})
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Languages */}
      <Section title="Languages">
        <div style={{ fontSize: 9.5, color: '#333', lineHeight: 1.8 }}>
          <span><strong>Arabic</strong> — Native</span>
          <span style={{ margin: '0 12px', color: '#ccc' }}>|</span>
          <span><strong>French</strong> — Fluent (C1)</span>
          <span style={{ margin: '0 12px', color: '#ccc' }}>|</span>
          <span><strong>English</strong> — Intermediate (B2)</span>
        </div>
      </Section>
    </div>
  );

  const renderMarkdownCV = (sections: { [key: string]: string[] }) => {
    const name = sections.header[0] ? sections.header[0].replace(/^#+/, "").trim() : candidate?.name || "Curriculum Vitae";
    const contactParts = sections.header.slice(1).filter(h => h.trim()).map(h => h.replace(/^[-*•]/, "").trim());

    return (
      <div style={S.page}>
        <div style={S.name}>{name}</div>
        {jobTitle && <div style={S.jobtitle}>{jobTitle} {companyName ? `@ ${companyName}` : ""}</div>}
        <hr style={S.rule} />
        <div style={S.contactRow}>
          {contactParts.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={S.contactSep}>·</span>}
              <span style={S.contactItem}>{c}</span>
            </React.Fragment>
          ))}
        </div>
        <hr style={S.rule} />

        {sections.summary.length > 0 && (
          <Section title="Profile">
            <div style={S.summary}>{sections.summary.map((l, i) => <p key={i} style={{ marginBottom: 2 }}>{l.replace(/^[-*•]/, "").trim()}</p>)}</div>
          </Section>
        )}

        {sections.experience.length > 0 && (
          <Section title="Experience">
            {sections.experience.map((line, idx) => {
              const isH = (line.startsWith("**") && line.endsWith("**")) || line.includes(" - ") || line.includes(" | ");
              return isH
                ? <div key={idx} style={{ ...S.expRole, marginTop: idx > 0 ? 6 : 0, marginBottom: 1 }}>{line.replace(/\*\*/g, "").trim()}</div>
                : <p key={idx} style={S.expDesc}>{line.replace(/^[-*•\s]+/, "").trim()}</p>;
            })}
          </Section>
        )}

        {sections.education.length > 0 && (
          <Section title="Education">
            {sections.education.map((line, idx) => (
              <p key={idx} style={{ ...S.expDesc, marginBottom: 2 }}>{line.replace(/\*\*/g, "").replace(/^[-*•\s]+/, "").trim()}</p>
            ))}
          </Section>
        )}

        {sections.skills.length > 0 && (
          <Section title="Skills">
            <div style={S.skillsRow}>
              {sections.skills.map((line, idx) => {
                const c = line.replace(/^[-*•\s]+/, "").replace(/\*\*/g, "").trim();
                return c ? <span key={idx} style={S.skillTag}><span style={S.skillDot} />{c}</span> : null;
              })}
            </div>
          </Section>
        )}

        {sections.other.length > 0 && (
          <Section title="Additional">
            {sections.other.map((line, idx) => <p key={idx} style={S.expDesc}>{line.replace(/^[-*•\s]+/, "").trim()}</p>)}
          </Section>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4 p-4 rounded-xl border bg-slate-50 border-slate-200 text-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-orange-600 flex items-center justify-center text-white font-bold text-[9px]">CV</div>
          <div>
            <h4 className="font-bold text-xs">Aperçu CV Professionnel</h4>
            <p className="text-[10px] text-slate-500">Mise en page LaTeX-style — Ctrl+P → Sauvegarder en PDF</p>
          </div>
        </div>
        <button onClick={handleDownloadPDF} className="inline-flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-500 font-semibold px-4 py-2 rounded-xl text-white shadow-md cursor-pointer transition-all">
          Télécharger PDF
        </button>
      </div>
      <div className="w-full bg-slate-200 rounded-xl p-4 md:p-6 flex justify-center overflow-x-auto">
        <div ref={contentRef} className="shadow-2xl" style={{ width: '210mm' }} id="pdf-cv-canvas">
          {candidate ? renderStructuredCandidate(candidate) : null}
          {!candidate && parsedMarkdown ? renderMarkdownCV(parsedMarkdown) : null}
        </div>
      </div>
    </div>
  );
};
