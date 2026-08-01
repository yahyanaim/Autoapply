export interface StoragePort {
  uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string>;
  deleteFile(fileUrl: string): Promise<void>;
  downloadFile(fileUrl: string): Promise<Buffer>;
  checkHealth(): Promise<void>;
}
