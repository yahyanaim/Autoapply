import { ApplicationPreparationStatus, ApplicationStatus } from '../enums';

export interface ApplicationTimeline {
  status?: ApplicationStatus;
  type?: 'note';
  timestamp: string;
  note?: string | null;
}

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  sourceResumeId: string | null;
  resumeVersionId: string | null;
  coverLetterId: string | null;
  status: ApplicationStatus;
  preparationStatus: ApplicationPreparationStatus;
  jobAnalysis: Record<string, unknown> | null;
  generationError: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  source: string | null;
  screenshotUrl: string | null;
  timeline: ApplicationTimeline[] | null;
  createdAt: string;
  updatedAt: string;
}
