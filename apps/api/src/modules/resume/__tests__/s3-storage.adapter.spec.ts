const mockSend = jest.fn();
const mockS3Client = jest.fn().mockImplementation((configuration) => ({
  configuration,
  send: mockSend,
}));

const mockCommand = class {
  constructor(readonly input: Record<string, unknown>) {}
};

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: mockS3Client,
  PutObjectCommand: mockCommand,
  GetObjectCommand: mockCommand,
  DeleteObjectCommand: mockCommand,
  HeadBucketCommand: mockCommand,
}));

import { S3StorageAdapter } from "../infrastructure/storage/s3-storage.adapter";

function config(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
}

describe("S3StorageAdapter", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockS3Client.mockClear();
  });

  it("keeps the AWS SDK defaults when no custom endpoint is configured", () => {
    new S3StorageAdapter(config({ AWS_REGION: "eu-west-3" }) as never);

    expect(mockS3Client).toHaveBeenCalledWith({ region: "eu-west-3" });
  });

  it("configures a validated R2-compatible S3 endpoint without forcing path style", () => {
    new S3StorageAdapter(
      config({
        S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
        S3_REGION: "auto",
        S3_ACCESS_KEY_ID: "test-access-key",
        S3_SECRET_ACCESS_KEY: "test-secret-key",
        S3_FORCE_PATH_STYLE: "false",
      }) as never,
    );

    expect(mockS3Client).toHaveBeenCalledWith({
      region: "auto",
      endpoint: "https://account-id.r2.cloudflarestorage.com/",
      forcePathStyle: false,
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });
  });

  it("uses an opaque object key rather than an uploaded filename", async () => {
    const adapter = new S3StorageAdapter(config() as never);
    mockSend.mockResolvedValue({});

    const location = await adapter.uploadFile(
      {
        buffer: Buffer.from("synthetic document"),
        originalname: "candidate-name@example.test-resume.pdf",
        mimetype: "application/pdf",
      },
      "resumes",
    );

    const command = mockSend.mock.calls[0][0] as InstanceType<
      typeof mockCommand
    >;
    expect(command.input.Key).toMatch(/^resumes\/[0-9a-f-]{36}$/);
    expect(String(command.input.Key)).not.toContain("candidate");
    expect(location).toMatch(/^s3:\/\/applyai-resumes\/resumes\//);
    expect(command.input.ServerSideEncryption).toBe("AES256");
  });

  it("rejects a malformed custom endpoint before creating an S3 client", () => {
    expect(
      () =>
        new S3StorageAdapter(
          config({ S3_ENDPOINT: "http://127.0.0.1:9000" }) as never,
        ),
    ).toThrow("S3_ENDPOINT");
  });
});
