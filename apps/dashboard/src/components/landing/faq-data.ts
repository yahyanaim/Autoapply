export interface LandingFaqItem {
  id: string;
  question: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}

/** The landing FAQ has one editable source of truth. */
export const LANDING_FAQ_ITEMS: readonly LandingFaqItem[] = [
  {
    id: "what-is-applyai",
    question: "What is ApplyAI?",
    paragraphs: [
      "ApplyAI helps job seekers find relevant jobs, understand how well they match, improve their resume truthfully, generate tailored application materials, and track their applications.",
    ],
  },
  {
    id: "automatic-applications",
    question: "Does ApplyAI apply to jobs automatically?",
    paragraphs: [
      "No. ApplyAI is assistive. It helps prepare applications and fill forms, but users remain in control and must review and submit each application.",
    ],
  },
  {
    id: "job-matching",
    question: "How does ApplyAI match me with jobs?",
    paragraphs: [
      "ApplyAI compares the user’s verified resume profile with job requirements and shows explainable scores, verified-skill overlap, and missing keywords.",
    ],
  },
  {
    id: "truthful-resumes",
    question: "Can ApplyAI invent experience or skills?",
    paragraphs: [
      "No. Resume optimization must use verified information. ApplyAI must not invent employers, degrees, dates, skills, achievements, or experience.",
    ],
  },
  {
    id: "free-plan",
    question: "What is included in the Free plan?",
    paragraphs: ["The current beta Free plan includes:"],
    items: [
      "3 CV-matched job-discovery runs per month.",
      "Up to 20 ranked jobs per discovery run.",
      "Explainable scores and skill overlap.",
      "Keyword-gap analysis.",
      "Resume upload and structured PDF/DOCX parsing.",
      "Manual application tracking.",
      "10 tracked applications per month.",
      "5 AI requests per month.",
      "1 truthful CV optimization per month.",
      "1 stored resume.",
      "5 MB encrypted storage.",
      "Profile, consent, export, and deletion controls.",
    ],
  },
  {
    id: "beta-access",
    question: "Is ApplyAI free during the beta?",
    paragraphs: [
      "ApplyAI currently offers a beta Free plan with the limits shown above. Beta access and those limits may change as the product evolves, so the current plan page is the source of truth for available access.",
    ],
  },
  {
    id: "resume-privacy",
    question: "Is my resume private?",
    paragraphs: [
      "ApplyAI’s Privacy Notice describes the account, resume, and AI-processing controls currently implemented. Resume storage and provider-backed AI features require consent, and you can review consent in Settings. Read the Privacy Notice for the full details and limitations.",
    ],
  },
  {
    id: "deletion-and-export",
    question: "Can I delete my account and data?",
    paragraphs: [
      "Yes. Settings includes controls to download a portable JSON export, review and revoke sessions, review consent, and permanently delete your account and stored resume files. The Privacy Notice explains the applicable retention limitations.",
    ],
  },
];
