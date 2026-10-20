import { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/page";
import { renderView, type RenderedView } from "./render";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isInitialized: false,
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: auth.replace }),
}));

vi.mock("@/lib/api/hooks/use-auth", () => ({
  useAuth: () => auth,
}));

// The assistant's scroll animation is independent of landing-session readiness.
vi.mock("@/components/career-chat/FloatingCareerAssistant", () => ({
  FloatingCareerAssistant: () => null,
}));

let view: RenderedView | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  auth.user = null;
  auth.isInitialized = false;
  window.localStorage.clear();
});

afterEach(() => {
  view?.cleanup();
  view = undefined;
  vi.useRealTimers();
});

describe("public landing session readiness", () => {
  it("includes public content in the server HTML before session initialization", () => {
    const html = renderToString(<LandingPage />);

    expect(html).toContain("Search for jobs");
    expect(html).toContain("feature-marquee-track");
    expect(auth.replace).not.toHaveBeenCalled();
  });

  it("renders and starts its headline while the session check is pending", () => {
    view = renderView(<LandingPage />);

    expect(view.required("main")).toBeTruthy();
    const headline = view.required("h1 > span.absolute");
    expect(headline.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1000));
    expect(headline.textContent?.length).toBeGreaterThan(0);
    expect(auth.replace).not.toHaveBeenCalled();
  });

  it("keeps public content available when initialization finishes without a user", () => {
    auth.isInitialized = true;
    view = renderView(<LandingPage />);

    expect(view.required('form[role="search"]')).toBeTruthy();
    expect(auth.replace).not.toHaveBeenCalled();
  });

  it("preserves the dashboard redirect for a restored authenticated session", () => {
    auth.isInitialized = true;
    auth.user = { id: "existing-member" };
    view = renderView(<LandingPage />);

    expect(view.container.textContent).toBe("");
    expect(auth.replace).toHaveBeenCalledWith("/dashboard");
  });
});
