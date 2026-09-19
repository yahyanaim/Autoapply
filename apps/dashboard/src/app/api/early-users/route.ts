import { createEarlyUserRequestHandler } from "@/lib/early-users/handler";
import {
  GoogleSheetsEarlyUsersStore,
  type EnvironmentReader,
  readGoogleSheetsEarlyUsersConfiguration,
} from "@/lib/early-users/google-sheets-store";
import { EarlyUserSubmissionService } from "@/lib/early-users/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let service: EarlyUserSubmissionService | undefined;
let configurationSignature: string | undefined;

function getService(): EarlyUserSubmissionService | undefined {
  const configuration = readGoogleSheetsEarlyUsersConfiguration(
    process.env as EnvironmentReader,
  );
  if (!configuration) return undefined;

  // The signature intentionally excludes the private key. It only invalidates
  // the warm instance when the sheet destination changes.
  const signature = `${configuration.sheetId}:${configuration.serviceAccountEmail}:${configuration.sheetName}`;
  if (!service || configurationSignature !== signature) {
    service = new EarlyUserSubmissionService(
      new GoogleSheetsEarlyUsersStore(configuration),
    );
    configurationSignature = signature;
  }
  return service;
}

const handleEarlyUserRequest = createEarlyUserRequestHandler({
  getService,
  reportFailure: () => {
    // Keep Sentry/logging metadata free of form fields, credentials, and errors.
    console.warn("early_user_submission_failed");
  },
});

export async function POST(request: Request): Promise<Response> {
  return handleEarlyUserRequest(request);
}
