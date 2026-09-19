import { Injectable } from '@nestjs/common';
import {
  S3Client,
  S3ClientConfig,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { StoragePort } from '../../../../shared/ports/storage.port';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { parseExternalHttpsBaseUrl } from '../../../../shared/config/external-endpoint';

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private s3: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    const customEndpoint = this.configService.get<string>('S3_ENDPOINT', '');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>(
      'S3_SECRET_ACCESS_KEY',
      '',
    );
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new Error('S3 credentials must be configured as an access-key pair');
    }

    const awsRegion = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';
    const customRegion = this.configService.get<string>('S3_REGION') ?? '';
    const configuration: S3ClientConfig = {
      region: customRegion || awsRegion,
    };
    if (customEndpoint) {
      configuration.endpoint = parseExternalHttpsBaseUrl(
        customEndpoint,
        'S3_ENDPOINT',
      ).toString();
      configuration.forcePathStyle =
        this.configService.get<string>('S3_FORCE_PATH_STYLE', 'false') ===
        'true';
    }
    if (accessKeyId && secretAccessKey) {
      configuration.credentials = { accessKeyId, secretAccessKey };
    }
    this.s3 = new S3Client(configuration);
    this.bucket = this.configService.get(
      'S3_BUCKET_RESUMES',
      'applyai-resumes',
    );
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string> {
    // Stored object keys are deliberately opaque: uploaded filenames can carry
    // personal data and must not become durable storage identifiers.
    const key = `${folder}/${randomUUID()}`;
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
