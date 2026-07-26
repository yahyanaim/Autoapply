import { RemoteType } from '../enums';

export interface SearchJobsDto {
  query?: string;
  location?: string;
  remoteType?: RemoteType;
  salaryMin?: number;
  salaryMax?: number;
  page?: number;
  limit?: number;
}
