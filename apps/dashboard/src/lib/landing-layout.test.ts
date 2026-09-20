import { describe, expect, it } from "vitest";
import { LANDING_SECTION_SPACING } from "./landing-layout";

describe("landing-page section spacing", () => {
  it("tightens only the feature-to-workflow boundary at mobile and desktop sizes", () => {
    expect(LANDING_SECTION_SPACING.features).toContain("pb-10");
    expect(LANDING_SECTION_SPACING.features).toContain("sm:pb-12");
    expect(LANDING_SECTION_SPACING.workflow).toContain("pt-10");
    expect(LANDING_SECTION_SPACING.workflow).toContain("sm:pt-14");
  });

  it("uses the Companies section top padding as the only spacing after Features coming", () => {
    expect(LANDING_SECTION_SPACING.pricing).toContain("pb-0");
    expect(LANDING_SECTION_SPACING.pricing).toContain("sm:pb-0");
    expect(LANDING_SECTION_SPACING.pricing).not.toContain("gap-");
  });
});
