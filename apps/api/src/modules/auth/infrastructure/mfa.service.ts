import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@Injectable()
export class MfaService {
  private readonly base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  createEnrollment(email: string) {
    const secret = this.encodeBase32(randomBytes(20));
    const label = encodeURIComponent(`ApplyAI:${email}`);
    const issuer = encodeURIComponent('ApplyAI');
    return {
      secret,
      otpAuthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      encryptedSecret: this.encrypt(secret),
    };
  }

  verifyEncryptedSecret(encryptedSecret: string, code: string): boolean {
    return this.verifyCode(this.decrypt(encryptedSecret), code);
  }

  verifyCode(secret: string, code: string, timestamp?: number): boolean {
    const referenceTime = timestamp ?? this.clock.nowMs();
    if (!/^\d{6}$/.test(code)) return false;
    for (const offset of [-1, 0, 1]) {
      const expected = this.generateCode(
        secret,
        referenceTime + offset * 30_000,
      );
      const actualBuffer = Buffer.from(code);
      const expectedBuffer = Buffer.from(expected);
      if (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      ) {
        return true;
      }
    }
    return false;
  }

  generateCode(secret: string, timestamp?: number): string {
    const counter = Math.floor((timestamp ?? this.clock.nowMs()) / 30_000);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.decodeBase32(secret))
      .update(counterBuffer)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decrypt(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = value.split('.');
    if (
      version !== 'v1' ||
      !ivValue ||
      !tagValue ||
      !ciphertextValue
    ) {
      throw new BadRequestException('Stored MFA configuration is invalid');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException('Stored MFA configuration could not be read');
    }
  }

  private encryptionKey(): Buffer {
    const configured = this.configService.get<string>('MFA_ENCRYPTION_KEY');
    if (configured) {
      const key = Buffer.from(configured, 'base64');
      if (key.length !== 32) {
        throw new Error('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
      }
      return key;
    }
    return createHash('sha256')
      .update(
        `${this.configService.getOrThrow<string>('JWT_SECRET')}:applyai:mfa`,
      )
      .digest();
  }

  private encodeBase32(value: Buffer): string {
    let bits = '';
    for (const byte of value) bits += byte.toString(2).padStart(8, '0');
    let encoded = '';
    for (let index = 0; index < bits.length; index += 5) {
      encoded += this.base32Alphabet[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
      ];
    }
    return encoded;
  }

  private decodeBase32(value: string): Buffer {
    const normalized = value.toUpperCase().replace(/=+$/, '');
    let bits = '';
    for (const character of normalized) {
      const index = this.base32Alphabet.indexOf(character);
      if (index < 0) throw new BadRequestException('Invalid MFA secret');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
