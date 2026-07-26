import { deflateRawSync } from 'zlib';
import { DocxParser } from '../infrastructure/parsers/docx.parser';

interface ZipEntry {
  name: string;
  content: Buffer;
  method?: 0 | 8;
  declaredSize?: number;
}

function storedDocx(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(entry.content) : entry.content;
    const declaredSize = entry.declaredSize ?? entry.content.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declaredSize, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const contentTypes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  </Types>`);

describe('DocxParser archive limits', () => {
  it('accepts and extracts text from a real minimal DOCX package', async () => {
    const archive = storedDocx([
      { name: '[Content_Types].xml', content: contentTypes },
      {
        name: '_rels/.rels',
        content: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
          </Relationships>`),
      },
      {
        name: 'word/document.xml',
        content: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body><w:p><w:r><w:t>Security Engineer</w:t></w:r></w:p></w:body>
          </w:document>`),
      },
    ]);

    expect(() => DocxParser.validateArchive(archive)).not.toThrow();
    await expect(DocxParser.extractText(archive)).resolves.toContain('Security Engineer');
  });

  it('rejects an entry whose declared expansion exceeds the aggregate limit', () => {
    const archive = storedDocx([
      { name: '[Content_Types].xml', content: contentTypes },
      {
        name: 'word/document.xml',
        content: Buffer.from('<document/>'),
        declaredSize: 20 * 1024 * 1024 + 1,
      },
    ]);

    expect(() => DocxParser.validateArchive(archive)).toThrow(/too large/);
  });

  it('rejects a deflate stream that expands beyond its forged declared size', () => {
    const archive = storedDocx([
      { name: '[Content_Types].xml', content: contentTypes },
      {
        name: 'word/document.xml',
        content: Buffer.alloc(21 * 1024 * 1024, 65),
        method: 8,
        declaredSize: 1,
      },
    ]);

    expect(() => DocxParser.validateArchive(archive)).toThrow(/invalid or too large/);
  });
});
