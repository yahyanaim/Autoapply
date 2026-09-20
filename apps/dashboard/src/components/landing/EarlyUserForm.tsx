"use client";

import { isValidElement, type FormEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  EARLY_USER_JOB_SEARCH_STATUSES,
  EARLY_USER_PREFERRED_LANGUAGES,
  parseEarlyUserSubmission,
} from "@/lib/early-users/submission";

type FieldName =
  | "firstName"
  | "email"
  | "country"
  | "jobSearchStatus"
  | "preferredLanguage"
  | "targetRole"
  | "heardAbout"
  | "mainProblem"
  | "consent"
  | "website";

interface FormValues {
  firstName: string;
  email: string;
  country: string;
  jobSearchStatus: string;
  preferredLanguage: string;
  targetRole: string;
  heardAbout: string;
  mainProblem: string;
  consent: boolean;
  website: string;
}

const initialValues: FormValues = {
  firstName: "",
  email: "",
  country: "",
  jobSearchStatus: "",
  preferredLanguage: "",
  targetRole: "",
  heardAbout: "",
  mainProblem: "",
  consent: false,
  website: "",
};

const SUCCESS_MESSAGE =
  "Thank you. You are on the ApplyAI early-user list. We will contact you when the beta opens.";
const GENERIC_ERROR_MESSAGE =
  "We could not add you to the early-user list right now. Please try again later.";

const jobSearchLabels: Record<(typeof EARLY_USER_JOB_SEARCH_STATUSES)[number], string> = {
  "actively-searching": "Actively searching",
  "open-to-opportunities": "Open to opportunities",
  "preparing-to-search": "Preparing to search",
  other: "Other",
};

const languageLabels: Record<(typeof EARLY_USER_PREFERRED_LANGUAGES)[number], string> = {
  english: "English",
  arabic: "Arabic",
  french: "French",
  other: "Other",
};

export function EarlyUserForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const idempotencyKey = useRef<string | undefined>(undefined);

  const updateValue = (field: Exclude<FieldName, "consent">, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus("idle");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseEarlyUserSubmission(values);
    if (!parsed.success) {
      const nextErrors: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !nextErrors[field as FieldName]) {
          nextErrors[field as FieldName] = issue.message;
        }
      }
      setErrors(nextErrors);
      setStatus("idle");
      return;
    }

    setErrors({});
    setStatus("submitting");
    idempotencyKey.current ??= createIdempotencyKey();

    try {
      const response = await fetch("/api/early-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) throw new Error("early_user_submission_failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-success-200 bg-success-50 p-6 text-center text-sm leading-6 text-success-800 sm:p-8 sm:text-base"
      >
        {SUCCESS_MESSAGE}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5" aria-label="Early beta registration">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name or preferred name" error={errors.firstName} required>
          <input
            id="early-user-first-name"
            name="firstName"
            autoComplete="given-name"
            maxLength={80}
            placeholder="e.g. Amira"
            value={values.firstName}
            onChange={(event) => updateValue("firstName", event.target.value)}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "early-user-first-name-error" : undefined}
            className={inputClass(errors.firstName)}
          />
        </Field>
        <Field label="Email address" error={errors.email} required>
          <input
            id="early-user-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
            value={values.email}
            onChange={(event) => updateValue("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "early-user-email-error" : undefined}
            className={inputClass(errors.email)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Country" error={errors.country} required>
          <input
            id="early-user-country"
            name="country"
            autoComplete="country-name"
            maxLength={80}
            placeholder="e.g. Morocco"
            value={values.country}
            onChange={(event) => updateValue("country", event.target.value)}
            aria-invalid={Boolean(errors.country)}
            aria-describedby={errors.country ? "early-user-country-error" : undefined}
            className={inputClass(errors.country)}
          />
        </Field>
        <SelectField
          id="early-user-job-search-status"
          name="jobSearchStatus"
          label="Current job-search"
          value={values.jobSearchStatus}
          error={errors.jobSearchStatus}
          onChange={(value) => updateValue("jobSearchStatus", value)}
          options={EARLY_USER_JOB_SEARCH_STATUSES.map((value) => ({
            value,
            label: jobSearchLabels[value],
          }))}
        />
        <SelectField
          id="early-user-preferred-language"
          name="preferredLanguage"
          label="Preferred language"
          value={values.preferredLanguage}
          error={errors.preferredLanguage}
          onChange={(value) => updateValue("preferredLanguage", value)}
          options={EARLY_USER_PREFERRED_LANGUAGES.map((value) => ({
            value,
            label: languageLabels[value],
          }))}
        />
        <Field label="Current role or target role" error={errors.targetRole}>
          <input
            id="early-user-target-role"
            name="targetRole"
            maxLength={120}
            placeholder="e.g. Product designer"
            value={values.targetRole}
            onChange={(event) => updateValue("targetRole", event.target.value)}
            aria-invalid={Boolean(errors.targetRole)}
            aria-describedby={errors.targetRole ? "early-user-target-role-error" : undefined}
            className={inputClass(errors.targetRole)}
          />
        </Field>
        <SelectField
          id="early-user-heard-about"
          name="heardAbout"
          label="How did you hear about ApplyAI?"
          value={values.heardAbout}
          error={errors.heardAbout}
          onChange={(value) => updateValue("heardAbout", value)}
          optional
          className="sm:col-span-2"
          options={[
            { value: "search", label: "Search" },
            { value: "social", label: "Social media" },
            { value: "friend", label: "Friend or colleague" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>

      <Field label="What is the main problem you want ApplyAI to solve?" error={errors.mainProblem}>
        <textarea
          id="early-user-main-problem"
          name="mainProblem"
          rows={4}
          maxLength={500}
          placeholder="For example, finding roles that fit my experience."
          value={values.mainProblem}
          onChange={(event) => updateValue("mainProblem", event.target.value)}
          aria-invalid={Boolean(errors.mainProblem)}
          aria-describedby={errors.mainProblem ? "early-user-main-problem-error" : undefined}
          className={`${inputClass(errors.mainProblem)} min-h-28 resize-y py-3`}
        />
      </Field>

      <div className="sr-only" aria-hidden="true">
        <label htmlFor="early-user-website">Website</label>
        <input
          id="early-user-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          maxLength={200}
          value={values.website}
          onChange={(event) => updateValue("website", event.target.value)}
        />
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/[0.08] bg-[#faf9f7] p-4 text-sm leading-6 text-gray-700">
          <input
            id="early-user-consent"
            name="consent"
            type="checkbox"
            checked={values.consent}
            onChange={(event) => {
              setValues((current) => ({ ...current, consent: event.target.checked }));
              setErrors((current) => ({ ...current, consent: undefined }));
              setStatus("idle");
            }}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? "early-user-consent-error" : undefined}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            I agree that ApplyAI may contact me about the Early Beta. I understand this does not guarantee an invitation or immediate access.
          </span>
        </label>
        {errors.consent && <FieldError id="early-user-consent-error" message={errors.consent} />}
      </div>

      {status === "error" && (
        <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {GENERIC_ERROR_MESSAGE}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full rounded-xl sm:w-auto" disabled={status === "submitting"}>
        {status === "submitting" ? "Joining the list…" : "Join the ApplyAI Early Beta"}
      </Button>
    </form>
  );
}

function Field({
  label,
  error,
  required = false,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = isValidElement<{ id?: string }>(children) ? children.props.id : undefined;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && id && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  error,
  onChange,
  options,
  optional = false,
  className,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  optional?: boolean;
  className?: string;
}) {
  return (
    <Field label={label} error={error} required={!optional} className={className}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(error)}
      >
        <option value="">{optional ? "Select an option" : "Select one"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="text-xs text-danger-600" role="alert">
      {message}
    </p>
  );
}

function inputClass(error?: string): string {
  return `flex h-11 min-w-0 w-full rounded-lg border bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 ${
    error
      ? "border-danger-500 focus-visible:border-danger-500 focus-visible:ring-danger-500/15"
      : "border-input"
  }`;
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `early-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}
