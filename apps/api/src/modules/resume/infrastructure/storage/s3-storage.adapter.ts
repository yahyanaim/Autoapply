import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { StoragePort } from '../../../../shared/ports/storage.port';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { basename } from 'path';

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private s3: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });
    this.bucket = this.configService.get(
      'S3_BUCKET_RESUMES',
      'applyai-resumes',
    );
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string> {
    const safeName = basename(file.originalname).replace(
      /[^a-zA-Z0-9._-]+/g,
      '-',
    );
    const key = `${folder}/${randomUUID()}-${safeName || 'upload'}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
      }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const key = this.extractKey(fileUrl);
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    const key = this.extractKey(fileUrl);
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) return Buffer.alloc(0);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async checkHealth(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private extractKey(fileUrl: string): string {
    const url = new URL(fileUrl);
    if (url.protocol === 's3:') {
      if (url.hostname !== this.bucket) throw new Error('Unexpected S3 bucket');
      return decodeURIComponent(url.pathname.replace(/^\//, ''));
    }

    const expectedHosts = new Set([
      `${this.bucket}.s3.amazonaws.com`,
      `${this.bucket}.s3.${this.configService.get('AWS_REGION', 'us-east-1')}.amazonaws.com`,
    ]);
    if (url.protocol !== 'https:' || !expectedHosts.has(url.hostname)) {
      throw new Error('Unexpected resume storage URL');
    }
    return decodeURIComponent(url.pathname.replace(/^\//, ''));
  }
}
