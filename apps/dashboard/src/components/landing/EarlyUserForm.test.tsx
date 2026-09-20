import { afterEach, describe, expect, it, vi } from "vitest";
import {
  click,
  flushUpdates,
  renderView,
  setFormValue,
  type RenderedView,
} from "@/test/render";
import { EarlyUserForm } from "./EarlyUserForm";

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
  vi.unstubAllGlobals();
});

function fillRequiredFields() {
  setFormValue(view!.required<HTMLInputElement>("#early-user-first-name"), "Avery");
  setFormValue(view!.required<HTMLInputElement>("#early-user-email"), "AVERY@EXAMPLE.TEST");
  setFormValue(view!.required<HTMLInputElement>("#early-user-country"), "France");
  setFormValue(view!.required<HTMLSelectElement>("#early-user-job-search-status"), "actively-searching");
  setFormValue(view!.required<HTMLSelectElement>("#early-user-preferred-language"), "english");
  click(view!.required<HTMLInputElement>("#early-user-consent"));
}

describe("early beta registration form", () => {
  it("provides labelled minimum fields and client-side consent/email validation", async () => {
    view = renderView(<EarlyUserForm />);
    const form = view.required<HTMLFormElement>('form[aria-label="Early beta registration"]');

    expect(view.required<HTMLInputElement>("#early-user-first-name").maxLength).toBe(80);
    expect(view.required<HTMLInputElement>("#early-user-email").maxLength).toBe(254);
    expect(view.required<HTMLTextAreaElement>("#early-user-main-problem").maxLength).toBe(500);
    expect(view.container.textContent).toContain("Current job-search *");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushUpdates();

    expect(view.container.textContent).toContain("Enter your first or preferred name.");
    expect(view.container.textContent).toContain("Consent is required to join the early-user list.");
  });

  it("keeps the longer supporting fields in a readable two-column layout", () => {
    view = renderView(<EarlyUserForm />);

    const countryGrid = view
      .required<HTMLInputElement>("#early-user-country")
      .closest(".grid");

    expect(countryGrid?.className).toContain("sm:grid-cols-2");
    expect(countryGrid?.className).not.toContain("sm:grid-cols-3");
    expect(
      view.required<HTMLSelectElement>("#early-user-heard-about").parentElement?.className,
    ).toContain("sm:col-span-2");
    expect(view.required<HTMLInputElement>("#early-user-country").placeholder).toBe("e.g. Morocco");
    expect(view.required<HTMLTextAreaElement>("#early-user-main-problem").placeholder).toContain(
      "finding roles",
    );
  });

  it("normalizes email, disables the button while submitting, and shows the safe success state", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    view = renderView(<EarlyUserForm />);
    fillRequiredFields();

    const form = view.required<HTMLFormElement>('form[aria-label="Early beta registration"]');
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushUpdates();

    const submitButton = view.required<HTMLButtonElement>('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/early-users",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    if (!request) throw new Error("Expected request options");
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(String(request.body)).toContain("avery@example.test");
    expect(String(request.body)).not.toContain("website");

    resolveResponse?.(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await flushUpdates();
    expect(view.container.textContent).toContain(
      "Thank you. You are on the ApplyAI early-user list. We will contact you when the beta opens.",
    );
  });

  it("returns a safe generic error for failed submissions and never exposes provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider token invalid", { status: 503 })));
    view = renderView(<EarlyUserForm />);
    fillRequiredFields();
    view
      .required<HTMLFormElement>('form[aria-label="Early beta registration"]')
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushUpdates();

    expect(view.container.textContent).toContain("We could not add you to the early-user list right now.");
    expect(view.container.textContent).not.toContain("provider token invalid");
  });
});
