import { afterEach, describe, expect, it } from "vitest";
import { click, renderView, type RenderedView } from "@/test/render";
import { FaqSection } from "./FaqSection";
import { LANDING_FAQ_ITEMS } from "./faq-data";

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe("landing FAQ", () => {
  it("renders one accessible accordion item for every structured FAQ entry", () => {
    view = renderView(<FaqSection />);
    const triggers = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));

    expect(triggers).toHaveLength(LANDING_FAQ_ITEMS.length);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
    click(triggers[4]);
    expect(view.container.textContent).toContain("3 CV-matched job-discovery runs per month.");
    expect(view.required<HTMLAnchorElement>('a[href="#early-beta"]')).toHaveProperty(
      "textContent",
      "Join the ApplyAI Early Beta",
    );
  });

  it("keeps one item open at a time with keyboard-operable buttons", () => {
    view = renderView(<FaqSection />);
    const triggers = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));

    triggers[0].focus();
    click(triggers[0]);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("true");

    click(triggers[1]);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
    expect(triggers[1].getAttribute("aria-expanded")).toBe("true");

    triggers[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(triggers[2]);
  });

  it("renders the FAQ content and Early Beta call to action in Arabic", () => {
    view = renderView(<FaqSection locale="ar" />);
    const triggers = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));

    expect(view.container.textContent).toContain("الأسئلة الشائعة");
    expect(triggers[0].textContent).toBe("ما هو ApplyAI؟");
    click(triggers[0]);
    expect(view.container.textContent).toContain("يساعد ApplyAI الباحثين عن عمل");
    expect(view.required<HTMLAnchorElement>('a[href="#early-beta"]').textContent).toBe(
      "انضم إلى النسخة التجريبية المبكرة من ApplyAI",
    );
  });
});
