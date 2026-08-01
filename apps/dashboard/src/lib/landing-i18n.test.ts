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
