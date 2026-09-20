import { describe, expect, it } from "vitest";
import { isLandingLocale, translateLanding } from "./landing-i18n";

describe("landing-page localization", () => {
  it("translates primary navigation and hero copy into Arabic", () => {
    expect(translateLanding("ar", "Features")).toBe("المزايا");
    expect(
      translateLanding(
        "ar",
        "A Smarter Way To Make Every Application Stronger.",
      ),
    ).toBe("طريقة أذكى لجعل كل طلب توظيف أقوى.");
  });

  it("translates the FAQ and Early Beta form copy into Arabic", () => {
    expect(translateLanding("ar", "Frequently asked questions")).toBe("الأسئلة الشائعة");
    expect(translateLanding("ar", "First name or preferred name")).toBe(
      "الاسم الأول أو الاسم المفضّل",
    );
    expect(translateLanding("ar", "Join the ApplyAI Early Beta")).toBe(
      "انضم إلى النسخة التجريبية المبكرة من ApplyAI",
    );
  });

  it("keeps English copy and unknown brand content unchanged", () => {
    expect(translateLanding("en", "Pricing")).toBe("Pricing");
    expect(translateLanding("ar", "ApplyAI")).toBe("ApplyAI");
  });

  it("accepts only supported persisted locale values", () => {
    expect(isLandingLocale("en")).toBe(true);
    expect(isLandingLocale("ar")).toBe(true);
    expect(isLandingLocale("fr")).toBe(false);
    expect(isLandingLocale(null)).toBe(false);
  });
});
