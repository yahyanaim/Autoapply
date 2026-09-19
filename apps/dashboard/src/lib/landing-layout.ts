/**
 * These boundary-only spacing classes keep the intentional landing-page rhythm
 * visible to tests without changing the internal spacing of either section.
 */
export const LANDING_SECTION_SPACING = {
  features: "overflow-hidden bg-white pb-12 pt-20 sm:pb-16 sm:pt-28",
  workflow: "bg-white pb-20 pt-12 sm:pb-32 sm:pt-16",
  pricing: "bg-[#f1f1ed] pb-10 pt-16 sm:pb-14 sm:pt-24",
} as const;
