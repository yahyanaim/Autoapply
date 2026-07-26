import { existsSync } from 'fs';
import { join } from 'path';
import { Worker } from 'worker_threads';

const PARSE_TIMEOUT_MS = 15_000;

export class PdfParser {
  static async extractText(buffer: Buffer): Promise<string> {
    const compiledWorker = join(__dirname, 'pdf-parse.thread.js');
    const workerPath = existsSync(compiledWorker)
      ? compiledWorker
      : join(__dirname, 'pdf-parse.thread.ts');
    const worker = new Worker(workerPath, {
      workerData: Buffer.from(buffer),
      execArgv: existsSync(compiledWorker) ? [] : ['-r', 'ts-node/register'],
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 4,
      },
    });

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, text?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        if (error) reject(error);
        else resolve(text ?? '');
      };
      const timeout = setTimeout(() => {
        finish(new Error('PDF parsing timed out'));
      }, PARSE_TIMEOUT_MS);
      worker.once('message', (message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'text' in message &&
          typeof message.text === 'string'
        ) {
          finish(undefined, message.text);
          return;
        }
        const detail =
          message && typeof message === 'object' && 'error' in message
            ? String(message.error)
            : 'PDF parsing failed';
        finish(new Error(detail));
      });
      worker.once('error', (error) => finish(error));
      worker.once('exit', (code) => {
        if (code !== 0) finish(new Error('PDF parser worker exited unexpectedly'));
      });
    });
  }
}
