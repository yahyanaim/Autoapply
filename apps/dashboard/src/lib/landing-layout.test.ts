import { describe, expect, it } from "vitest";
import { LANDING_SECTION_SPACING } from "./landing-layout";

describe("landing-page section spacing", () => {
  it("tightens only the feature-to-workflow boundary at mobile and desktop sizes", () => {
    expect(LANDING_SECTION_SPACING.features).toContain("pb-12");
    expect(LANDING_SECTION_SPACING.features).toContain("sm:pb-16");
    expect(LANDING_SECTION_SPACING.workflow).toContain("pt-12");
    expect(LANDING_SECTION_SPACING.workflow).toContain("sm:pt-16");
  });

  it("tightens only the pricing-to-company boundary without changing card spacing", () => {
    expect(LANDING_SECTION_SPACING.pricing).toContain("pb-10");
    expect(LANDING_SECTION_SPACING.pricing).toContain("sm:pb-14");
    expect(LANDING_SECTION_SPACING.pricing).not.toContain("gap-");
  });
});
