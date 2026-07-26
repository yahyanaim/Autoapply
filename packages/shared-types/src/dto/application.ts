import { ApplicationStatus } from '../enums';

export interface CreateApplicationDto {
  jobId: string;
  resumeVersionId?: string;
  coverLetterId?: string;
}

export interface UpdateApplicationDto {
  status: ApplicationStatus;
}
