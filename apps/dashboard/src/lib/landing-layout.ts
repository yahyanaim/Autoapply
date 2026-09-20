/**
 * These boundary-only spacing classes keep the intentional landing-page rhythm
 * visible to tests without changing the internal spacing of either section.
 */
export const LANDING_SECTION_SPACING = {
  features: "overflow-hidden bg-white pb-10 pt-20 sm:pb-12 sm:pt-28",
  workflow: "bg-white pb-20 pt-10 sm:pb-32 sm:pt-14",
  pricing: "bg-[#f1f1ed] pb-0 pt-16 sm:pb-0 sm:pt-24",
} as const;
