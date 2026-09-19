import { z } from "zod";

export const EARLY_USER_SHEET_COLUMNS = [
  "createdAt",
  "firstName",
  "email",
  "country",
  "jobSearchStatus",
  "preferredLanguage",
  "targetRole",
  "heardAbout",
  "mainProblem",
  "consent",
  "source",
  "status",
] as const;

export const EARLY_USER_JOB_SEARCH_STATUSES = [
  "actively-searching",
  "open-to-opportunities",
  "preparing-to-search",
  "other",
] as const;

export const EARLY_USER_PREFERRED_LANGUAGES = [
  "english",
  "arabic",
  "french",
  "other",
] as const;

export type EarlyUserJobSearchStatus =
  (typeof EARLY_USER_JOB_SEARCH_STATUSES)[number];
export type EarlyUserPreferredLanguage =
  (typeof EARLY_USER_PREFERRED_LANGUAGES)[number];

export interface EarlyUserSubmission {
  firstName: string;
  email: string;
  country: string;
  jobSearchStatus: EarlyUserJobSearchStatus;
  preferredLanguage: EarlyUserPreferredLanguage;
  targetRole?: string;
  heardAbout?: string;
  mainProblem?: string;
  consent: true;
}

export interface StoredEarlyUserSubmission extends EarlyUserSubmission {
  createdAt: string;
  source: "landing-page";
  status: "new";
}

const STRICT_EMAIL_PATTERN =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

const optionalText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength, `Must be ${maximumLength} characters or fewer.`)
    .optional()
    .transform((value) => value || undefined);

const strictEmail = z
  .string()
  .trim()
  .max(254, "Email address is too long.")
  .refine((value) => STRICT_EMAIL_PATTERN.test(value), {
    message: "Enter a valid email address.",
  })
  .transform((value) => value.toLowerCase());

/**
 * The public route accepts this deliberately small contract only. Strict parsing
 * prevents a browser from adding resume text, files, credentials, or arbitrary
 * telemetry fields to a beta-registration request.
 */
export const earlyUserSubmissionSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "Enter your first or preferred name.")
      .max(80, "Name is too long."),
    email: strictEmail,
    country: z
      .string()
      .trim()
      .min(1, "Enter your country.")
      .max(80, "Country is too long."),
    jobSearchStatus: z.enum(EARLY_USER_JOB_SEARCH_STATUSES),
    preferredLanguage: z.enum(EARLY_USER_PREFERRED_LANGUAGES),
    targetRole: optionalText(120),
    heardAbout: optionalText(120),
    mainProblem: optionalText(500),
    consent: z.literal(true, {
      errorMap: () => ({
        message: "Consent is required to join the early-user list.",
      }),
    }),
    // A visually hidden field catches unsophisticated automated submissions.
    website: z.string().max(200).optional().default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.website.trim().length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website"],
        message: "Invalid submission.",
      });
    }
  })
  .transform(({ website: _website, ...submission }): EarlyUserSubmission => submission);

export function parseEarlyUserSubmission(
  value: unknown,
): z.SafeParseReturnType<unknown, EarlyUserSubmission> {
  return earlyUserSubmissionSchema.safeParse(value);
}

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/;

export function isValidEarlyUserIdempotencyKey(value: string | null): value is string {
  return value !== null && IDEMPOTENCY_KEY_PATTERN.test(value);
}
