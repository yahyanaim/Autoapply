import { ApplicationStatus } from '../enums';

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
  resumeVersionId: string | null;
  coverLetterId: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  source: string | null;
  screenshotUrl: string | null;
  timeline: ApplicationTimeline[] | null;
  createdAt: string;
  updatedAt: string;
}
