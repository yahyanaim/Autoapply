import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly dummyPassword = 'applyai-password-timing-placeholder';
  private dummyHash?: string;
  private dummyHashPromise?: Promise<string>;

  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  async hash(password: string): Promise<string> {
    // Secure Argon2id settings
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyDummy(plain: string): Promise<void> {
    await this.verify(await this.getDummyHash(), plain);
  }

  private getDummyHash(): Promise<string> {
    if (this.dummyHash) return Promise.resolve(this.dummyHash);
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hash(this.dummyPassword)
        .then((hash) => {
          this.dummyHash = hash;
          return hash;
        })
        .finally(() => {
          this.dummyHashPromise = undefined;
        });
    }
    return this.dummyHashPromise;
  }
}
