import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  GeneratedResumeDocument,
  GeneratedResumeEducation,
  GeneratedResumeExperience,
  GeneratedResumeProject,
} from '../../domain/generated-resume';

const PAGE_MARGIN = 48;
const PAGE_BOTTOM = 48;
const BODY_FONT_SIZE = 9.6;
const BODY_LINE_GAP = 1.4;

@Injectable()
export class GeneratedResumePdfService {
  render(resume: GeneratedResumeDocument): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margins: {
          top: 38,
          right: PAGE_MARGIN,
          bottom: PAGE_BOTTOM,
          left: PAGE_MARGIN,
        },
        info: {
          Title: `${resume.contact.fullName} - CV`,
          Author: resume.contact.fullName,
          Subject: 'Professional resume',
          Creator: 'ApplyAI',
        },
        tagged: true,
        displayTitle: true,
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));

      try {
        this.drawDocument(document, resume);
        document.end();
      } catch (error) {
        document.end();
        reject(error);
      }
    });
  }

  private drawDocument(document: PDFKit.PDFDocument, resume: GeneratedResumeDocument): void {
    const contentWidth = this.contentWidth(document);

    document
      .font('Times-Bold')
      .fontSize(24)
      .fillColor('#111111')
      .text(resume.contact.fullName, PAGE_MARGIN, document.y, {
        width: contentWidth,
        align: 'center',
        lineGap: 1,
      });

    document.moveDown(0.35);
    this.drawRule(document, '#777777', 0.6);
    document.moveDown(0.65);

    const contactItems = [
      resume.contact.email,
      resume.contact.phone,
      resume.contact.location,
      displayUrl(resume.contact.linkedInUrl),
      displayUrl(resume.contact.portfolioUrl),
    ].filter((item): item is string => Boolean(item));

    document
      .font('Times-Roman')
      .fontSize(9.2)
      .fillColor('#242424')
      .text(contactItems.join('   |   '), PAGE_MARGIN, document.y, {
        width: contentWidth,
        align: 'center',
        lineGap: 2,
      });

    document.moveDown(0.65);
    this.drawRule(document, '#555555', 0.6);

    this.drawSectionHeading(document, 'Profile');
    this.drawParagraph(document, resume.profile);

    if (resume.experience.length) {
      this.drawSectionHeading(document, 'Professional Experience');
      resume.experience.forEach((item, index) => {
        this.drawExperience(document, item);
        if (index < resume.experience.length - 1) document.moveDown(0.7);
      });
    }

    if (resume.education.length) {
      this.drawSectionHeading(document, 'Education');
      resume.education.forEach((item, index) => {
        this.drawEducation(document, item);
        if (index < resume.education.length - 1) document.moveDown(0.55);
      });
    }

    if (resume.skills.length) {
      this.drawSectionHeading(document, 'Technical Skills');
      this.drawParagraph(document, resume.skills.join('  |  '), 9.3);
    }

    if (resume.projects.length) {
      this.drawSectionHeading(document, 'Projects');
      resume.projects.forEach((item, index) => {
        this.drawProject(document, item);
        if (index < resume.projects.length - 1) document.moveDown(0.55);
      });
    }

    if (resume.certifications.length) {
      this.drawSectionHeading(document, 'Certifications');
      this.drawBullets(document, resume.certifications);
    }

    if (resume.languages.length) {
      this.drawSectionHeading(document, 'Languages');
      this.drawParagraph(document, resume.languages.join('  |  '), 9.3);
    }

  }

  private drawSectionHeading(document: PDFKit.PDFDocument, title: string): void {
    this.ensureSpace(document, 38);
    document.moveDown(0.9);
    document
      .font('Times-Bold')
      .fontSize(10.8)
      .fillColor('#111111')
      .text(title.toUpperCase(), PAGE_MARGIN, document.y, {
        width: this.contentWidth(document),
        characterSpacing: 1.05,
      });
    document.moveDown(0.3);
    this.drawRule(document, '#b6b6b6', 0.45);
    document.moveDown(0.55);
  }

  private drawExperience(
    document: PDFKit.PDFDocument,
    item: GeneratedResumeExperience,
  ): void {
    const estimatedHeight =
      24 +
      document.heightOfString(item.description, {
        width: this.contentWidth(document),
        lineGap: BODY_LINE_GAP,
      }) +
      Math.min(item.highlights.length, 3) * 13;
    this.ensureSpace(document, Math.min(estimatedHeight, 120));

    this.drawDatedTitle(
      document,
      item.title,
      item.company,
      `${item.startDate} - ${item.endDate}`,
    );
    if (item.description) {
      document.moveDown(0.15);
      this.drawParagraph(document, item.description);
    }
    if (item.highlights.length) {
      document.moveDown(0.2);
      this.drawBullets(document, item.highlights);
    }
  }

  private drawEducation(
    document: PDFKit.PDFDocument,
    item: GeneratedResumeEducation,
  ): void {
    this.ensureSpace(document, 42);
    this.drawDatedTitle(
      document,
      item.degree,
      item.institution,
      `${item.startDate} - ${item.endDate}`,
    );
    if (item.gpa) {
      document
        .font('Times-Italic')
        .fontSize(9.2)
        .fillColor('#454545')
        .text(`GPA: ${item.gpa}`, PAGE_MARGIN, document.y + 1, {
          width: this.contentWidth(document),
        });
    }
  }

  private drawProject(document: PDFKit.PDFDocument, item: GeneratedResumeProject): void {
    this.ensureSpace(document, 58);
    document
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#111111')
      .text(item.name, PAGE_MARGIN, document.y, {
        width: this.contentWidth(document),
      });
    if (item.description) {
      document.moveDown(0.1);
      this.drawParagraph(document, item.description);
    }
    const details = [item.technologies.join(' | '), displayUrl(item.url)]
      .filter(Boolean)
      .join('   |   ');
    if (details) {
      document
        .font('Times-Roman')
        .fontSize(8.6)
        .fillColor('#666666')
        .text(details, PAGE_MARGIN, document.y + 1, {
          width: this.contentWidth(document),
          lineGap: 1,
        });
    }
  }

  private drawDatedTitle(
    document: PDFKit.PDFDocument,
    title: string,
    organization: string,
    dates: string,
  ): void {
    const dateWidth = 115;
    const gap = 10;
    const leftWidth = this.contentWidth(document) - dateWidth - gap;
    const rowY = document.y;
    const leftText = `${title} - ${organization}`;
    const leftHeight = document.heightOfString(leftText, {
      width: leftWidth,
      lineGap: 1,
    });

    document
      .font('Times-Bold')
      .fontSize(10)
      .fillColor('#111111')
      .text(leftText, PAGE_MARGIN, rowY, {
        width: leftWidth,
        lineGap: 1,
      });
    document
      .font('Times-Roman')
      .fontSize(8.9)
      .fillColor('#444444')
      .text(dates, PAGE_MARGIN + leftWidth + gap, rowY + 1, {
        width: dateWidth,
        align: 'right',
      });
    document.y = rowY + Math.max(leftHeight, 12) + 2;
  }

  private drawParagraph(
    document: PDFKit.PDFDocument,
    text: string,
    fontSize = BODY_FONT_SIZE,
  ): void {
    document
      .font('Times-Roman')
      .fontSize(fontSize)
      .fillColor('#222222')
      .text(text, PAGE_MARGIN, document.y, {
        width: this.contentWidth(document),
        align: 'left',
        lineGap: BODY_LINE_GAP,
      });
  }

  private drawBullets(document: PDFKit.PDFDocument, items: string[]): void {
    for (const item of items) {
      this.ensureSpace(document, 17);
      const rowY = document.y;
      const textX = PAGE_MARGIN + 19;
      const textWidth = this.contentWidth(document) - 19;
      const rowHeight = document.heightOfString(item, {
        width: textWidth,
        lineGap: BODY_LINE_GAP,
      });
      document
        .font('Times-Roman')
        .fontSize(BODY_FONT_SIZE)
        .fillColor('#222222')
        .text('•', PAGE_MARGIN + 7, rowY, { width: 10 })
        .text(item, textX, rowY, {
          width: textWidth,
          lineGap: BODY_LINE_GAP,
        });
      document.y = rowY + Math.max(rowHeight, 12);
    }
  }

  private drawRule(
    document: PDFKit.PDFDocument,
    color: string,
    width: number,
  ): void {
    const y = document.y;
    document
      .save()
      .strokeColor(color)
      .lineWidth(width)
      .moveTo(PAGE_MARGIN, y)
      .lineTo(document.page.width - PAGE_MARGIN, y)
      .stroke()
      .restore();
  }

  private ensureSpace(document: PDFKit.PDFDocument, needed: number): void {
    const bottom = document.page.height - PAGE_BOTTOM;
    if (document.y + needed <= bottom) return;
    document.addPage();
  }

  private contentWidth(document: PDFKit.PDFDocument): number {
    return document.page.width - PAGE_MARGIN * 2;
  }
}

function displayUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
