import mammoth from 'mammoth';
import { inflateRawSync } from 'zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_ENTRY = 0x04034b50;
const MAX_ENTRIES = 1_000;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

export class DocxParser {
  static validateArchive(buffer: Buffer): void {
    const eocdOffset = this.findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) {
      throw new Error('DOCX central directory is missing');
    }

    const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
    const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
    const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const centralSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
      diskNumber !== 0 ||
      centralDisk !== 0 ||
      entriesOnDisk !== entryCount ||
      entryCount === 0 ||
      entryCount > MAX_ENTRIES ||
      centralOffset + centralSize > eocdOffset
    ) {
      throw new Error('DOCX central directory is invalid');
    }

    let offset = centralOffset;
    let totalUncompressed = 0;
    const names = new Set<string>();
    for (let index = 0; index < entryCount; index++) {
      if (
        offset + 46 > eocdOffset ||
        buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY
      ) {
        throw new Error('DOCX entry metadata is invalid');
      }

      const flags = buffer.readUInt16LE(offset + 8);
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const declaredSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localOffset = buffer.readUInt32LE(offset + 42);
      const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength;
      if (
        (flags & 0x1) !== 0 ||
        (method !== 0 && method !== 8) ||
        compressedSize === 0xffffffff ||
        declaredSize === 0xffffffff ||
        localOffset === 0xffffffff ||
        declaredSize > MAX_UNCOMPRESSED_BYTES ||
        entryEnd > eocdOffset
      ) {
        throw new Error('DOCX entry is unsupported or too large');
      }

      const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');
      names.add(name);
      totalUncompressed += this.validateEntry(
        buffer,
        localOffset,
        flags,
        method,
        compressedSize,
        declaredSize,
        MAX_UNCOMPRESSED_BYTES - totalUncompressed,
        centralOffset,
      );
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('DOCX expands beyond the safe limit');
      }
      offset = entryEnd;
    }

    if (
      offset !== centralOffset + centralSize ||
      !names.has('[Content_Types].xml') ||
      !names.has('word/document.xml')
    ) {
      throw new Error('DOCX is missing required document entries');
    }
  }

  static async extractText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  private static validateEntry(
    buffer: Buffer,
    localOffset: number,
    centralFlags: number,
    method: number,
    compressedSize: number,
    declaredSize: number,
    remainingBytes: number,
    centralOffset: number,
  ): number {
    if (
      remainingBytes < 0 ||
      localOffset + 30 > centralOffset ||
      buffer.readUInt32LE(localOffset) !== LOCAL_FILE_ENTRY
    ) {
      throw new Error('DOCX local entry is invalid');
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const fileNameLength = buffer.readUInt16LE(localOffset + 26);
    const extraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataOffset + compressedSize;
    if (
      (localFlags & 0x1) !== 0 ||
      localFlags !== centralFlags ||
      localMethod !== method ||
      dataEnd > centralOffset
    ) {
      throw new Error('DOCX local entry metadata does not match');
    }

    if (method === 0) {
      if (compressedSize !== declaredSize || declaredSize > remainingBytes) {
        throw new Error('DOCX stored entry is too large');
      }
      return declaredSize;
    }

    const maximum = Math.min(MAX_UNCOMPRESSED_BYTES, remainingBytes);
    if (maximum < 0) throw new Error('DOCX expands beyond the safe limit');
    let output: Buffer;
    try {
      output = inflateRawSync(buffer.subarray(dataOffset, dataEnd), {
        maxOutputLength: maximum + 1,
      });
    } catch {
      throw new Error('DOCX compressed entry is invalid or too large');
    }
    if (output.length !== declaredSize || output.length > maximum) {
      throw new Error('DOCX expanded entry size does not match its metadata');
    }
    return output.length;
  }

  private static findEndOfCentralDirectory(buffer: Buffer): number {
    const minimum = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minimum; offset--) {
      if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
    }
    return -1;
  }
}
