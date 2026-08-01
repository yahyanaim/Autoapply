import { Injectable } from '@nestjs/common';
import { StoragePort } from '../ports/storage.port';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string> {
    const targetFolder = path.join(this.uploadDir, folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `${randomUUID()}${fileExtension}`;
    const filePath = path.join(targetFolder, fileName);

    await fs.promises.writeFile(filePath, file.buffer);

    return `/uploads/${folder}/${fileName}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const filePath = this.resolveFile(fileUrl);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveFile(fileUrl));
  }

  async checkHealth(): Promise<void> {
    await fs.promises.access(
      this.uploadDir,
      fs.constants.R_OK | fs.constants.W_OK,
    );
  }

  private resolveFile(fileUrl: string): string {
    if (!fileUrl.startsWith('/uploads/'))
      throw new Error('Unexpected local storage URL');
    const filePath = path.resolve(
      this.uploadDir,
      fileUrl.slice('/uploads/'.length),
    );
    if (!filePath.startsWith(`${path.resolve(this.uploadDir)}${path.sep}`)) {
      throw new Error('Invalid local storage path');
    }
    return filePath;
  }
}
