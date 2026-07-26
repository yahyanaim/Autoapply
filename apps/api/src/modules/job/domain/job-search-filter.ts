import { RemoteType } from '@prisma/client';

export interface JobSearchFilter {
  query?: string;
  location?: string;
  remoteType?: RemoteType;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
  page?: number;
  limit?: number;
}
