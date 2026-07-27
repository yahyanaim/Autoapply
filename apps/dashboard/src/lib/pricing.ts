export type PublicPlanName = 'Free' | 'Pro' | 'Premium';

export interface PublicPricingPlan {
  name: PublicPlanName;
  price: string;
  description: string;
  image: string;
  imageAlt: string;
  imageLabel: string;
  currentFeatures: string[];
  roadmapFeatures: string[];
  cta: string;
  popular?: boolean;
}

export const pricingPlans: PublicPricingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    description: 'Build your verified profile and test CV-matched discovery.',
    image: '/images/applyai-career-focus.jpg',
    imageAlt: 'Professional planning a focused job search',
    imageLabel: 'Build your foundation',
    currentFeatures: [
      '3 CV-matched discovery runs per month, with up to 20 ranked jobs each',
      'Explainable scores, verified-skill overlap, and keyword gaps',
      'Resume upload and structured PDF/DOCX parsing',
      'Manual application tracker and timeline',
      '10 tracked applications per month',
      '50 AI requests per month',
      '1 stored resume and 5 MB encrypted storage',
      'Profile, consent, export, and deletion controls',
    ],
    roadmapFeatures: [],
    cta: 'Start free',
  },
  {
    name: 'Pro',
    price: '$19',
    description: 'The complete assistive workflow for an active job search.',
    image: '/images/applyai-application-review.jpg',
    imageAlt: 'Professional reviewing an application',
    imageLabel: 'Apply with confidence',
    currentFeatures: [
      '50 CV-matched discovery runs per month, with up to 20 ranked jobs each',
      'Unified job analysis, optimized CV, and cover-letter workflow',
      'Chrome extension job capture and approved-package autofill',
      'Everything in Free',
      'Approved Greenhouse, Lever, and Ashby job aggregation',
      'Truthful resume optimization with fabrication checks',
      'Human review, editing, regeneration, and approval controls',
      'Unlimited tracked applications',
      '500 AI requests per month',
      'Up to 5 stored resumes and 25 MB encrypted storage',
      'Remote, location, salary, and visa profile preferences',
    ],
    roadmapFeatures: [
      'Application funnel and response analytics · V1',
      'Email and browser notifications · V1',
      'Additional job-site adapters after ToS and legal review · phased',
    ],
    cta: 'Choose Pro',
    popular: true,
  },
  {
    name: 'Premium',
    price: '$49',
    description: 'Unlimited capacity plus advanced career intelligence.',
    image: '/images/applyai-interview-notes.jpg',
    imageAlt: 'Professionals preparing for interviews',
    imageLabel: 'Take the next step',
    currentFeatures: [
      'Everything in Pro',
      'Unlimited CV-matched discovery runs',
      'Unlimited AI requests',
      'Unlimited stored resumes',
      'Up to 2 GB encrypted resume storage',
      'All shipped ApplyAI application tools',
    ],
    roadmapFeatures: [
      'Interview Coach for behavioral, technical, system-design, and coding practice · V1',
      'AI Career Advisor and learning paths · V2',
      'Salary prediction · V2',
      'AI Recruiter Chat with natural-language filters · V2',
      'Voice mock interview mode · V2',
    ],
    cta: 'Choose Premium',
  },
];
