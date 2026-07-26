import { parentPort, workerData } from 'worker_threads';
import { PDFParse } from 'pdf-parse';

const MAX_RETURNED_TEXT = 100_000;

const extractText = async (): Promise<string> => {
  const parser = new PDFParse({ data: Buffer.from(workerData as Uint8Array) });
  try {
    const result = await parser.getText();
    return result.text.slice(0, MAX_RETURNED_TEXT);
  } finally {
    await parser.destroy();
  }
};

void extractText()
  .then((text) => parentPort?.postMessage({ text }))
  .catch((error: unknown) =>
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : 'PDF parsing failed',
    }),
  );
