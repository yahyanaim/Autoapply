import { createSign } from "node:crypto";
import {
  EARLY_USER_SHEET_COLUMNS,
  type StoredEarlyUserSubmission,
} from "./submission";
import type { EarlyUserClaimResult, EarlyUserStore } from "./store";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,200}$/;
const SHEET_NAME_PATTERN = /^[A-Za-z0-9 _-]{1,80}$/;
const SERVICE_ACCOUNT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/;

export interface GoogleSheetsEarlyUsersConfiguration {
  sheetId: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  sheetName: string;
}

export interface EnvironmentReader {
  EARLY_USERS_SHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  EARLY_USERS_SHEET_NAME?: string;
}

export type EarlyUsersFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class EarlyUsersStorageError extends Error {
  constructor() {
    super("Early-user storage is unavailable.");
  }
}

export function readGoogleSheetsEarlyUsersConfiguration(
  environment: EnvironmentReader,
): GoogleSheetsEarlyUsersConfiguration | undefined {
  const sheetId = environment.EARLY_USERS_SHEET_ID?.trim() ?? "";
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const serviceAccountPrivateKey =
    environment.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "";
  const sheetName = environment.EARLY_USERS_SHEET_NAME?.trim() || "Early Users";

  if (!sheetId || !serviceAccountEmail || !serviceAccountPrivateKey) return undefined;
  if (
    !SHEET_ID_PATTERN.test(sheetId) ||
    !SHEET_NAME_PATTERN.test(sheetName) ||
    !SERVICE_ACCOUNT_EMAIL_PATTERN.test(serviceAccountEmail)
  ) {
    return undefined;
  }

  return { sheetId, serviceAccountEmail, serviceAccountPrivateKey, sheetName };
}

/**
 * Server-only Google Sheets adapter. Browser code never imports this file or
 * sees its configuration. It verifies the expected header before writing and
 * sends only the approved registration columns to Google.
 */
export class GoogleSheetsEarlyUsersStore implements EarlyUserStore {
  private accessToken: { value: string; expiresAt: number } | undefined;

  constructor(
    private readonly configuration: GoogleSheetsEarlyUsersConfiguration,
    private readonly request: EarlyUsersFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async claim(
    submission: StoredEarlyUserSubmission,
  ): Promise<EarlyUserClaimResult> {
    const accessToken = await this.getAccessToken();
    const values = await this.getSheetValues(accessToken);
    this.assertExpectedHeader(values);

    const duplicate = values.slice(1).some((row) => {
      const storedEmail = row[2];
      return typeof storedEmail === "string" && storedEmail.trim().toLowerCase() === submission.email;
    });
    if (duplicate) return "duplicate";

    await this.appendSubmission(accessToken, submission);
    return "created";
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 30_000) {
      return this.accessToken.value;
    }

    const issuedAt = Math.floor(this.now() / 1_000);
    const assertion = this.createSignedAssertion(issuedAt);
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
    const response = await this.safeRequest(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const value = await this.safeJson(response);
    const token = asString(value.access_token);
    const expiresIn = asPositiveNumber(value.expires_in);
    if (!token || !expiresIn) throw new EarlyUsersStorageError();

    this.accessToken = {
      value: token,
      expiresAt: this.now() + expiresIn * 1_000,
    };
    return token;
  }

  private createSignedAssertion(issuedAt: number): string {
    const encodedHeader = toBase64Url({ alg: "RS256", typ: "JWT" });
    const encodedClaim = toBase64Url({
      iss: this.configuration.serviceAccountEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3_600,
    });
    const unsignedToken = `${encodedHeader}.${encodedClaim}`;

    try {
      const signer = createSign("RSA-SHA256");
      signer.update(unsignedToken);
      signer.end();
      return `${unsignedToken}.${signer.sign(
        this.configuration.serviceAccountPrivateKey,
        "base64url",
      )}`;
    } catch {
      throw new EarlyUsersStorageError();
    }
  }

  private async getSheetValues(accessToken: string): Promise<unknown[][]> {
    const response = await this.safeRequest(
      `${GOOGLE_SHEETS_BASE_URL}/${encodeURIComponent(this.configuration.sheetId)}/values/${encodeURIComponent(`${this.configuration.sheetName}!A:L`)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    const value = await this.safeJson(response);
    if (!Array.isArray(value.values) || !value.values.every(Array.isArray)) {
      throw new EarlyUsersStorageError();
    }
    return value.values;
  }

  private assertExpectedHeader(values: unknown[][]): void {
    const header = values[0];
    if (
      !header ||
      header.length < EARLY_USER_SHEET_COLUMNS.length ||
      !EARLY_USER_SHEET_COLUMNS.every((column, index) => header[index] === column)
    ) {
      throw new EarlyUsersStorageError();
    }
  }

  private async appendSubmission(
    accessToken: string,
    submission: StoredEarlyUserSubmission,
  ): Promise<void> {
    const row = EARLY_USER_SHEET_COLUMNS.map((column) => {
      const value = submission[column];
      return typeof value === "boolean" ? String(value) : value ?? "";
    });
    await this.safeRequest(
      `${GOOGLE_SHEETS_BASE_URL}/${encodeURIComponent(this.configuration.sheetId)}/values/${encodeURIComponent(`${this.configuration.sheetName}!A:L`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
        cache: "no-store",
      },
    );
  }

  private async safeRequest(input: string, init: RequestInit): Promise<Response> {
    try {
      const response = await this.request(input, init);
      if (!response.ok) throw new EarlyUsersStorageError();
      return response;
    } catch (error) {
      if (error instanceof EarlyUsersStorageError) throw error;
      throw new EarlyUsersStorageError();
    }
  }

  private async safeJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json();
      if (!isRecord(value)) throw new EarlyUsersStorageError();
      return value;
    } catch (error) {
      if (error instanceof EarlyUsersStorageError) throw error;
      throw new EarlyUsersStorageError();
    }
  }
}

function toBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
