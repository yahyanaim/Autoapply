import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/api-client';

export type RemoteType = 'remote' | 'hybrid' | 'onsite';

export interface Job {
  id: string;
  source: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  location: string | null;
  remoteType: RemoteType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  skills: Array<{ id: string; name: string }>;
}

export interface JobSearchParams {
  query?: string;
  location?: string;
  remoteType?: RemoteType;
  salaryMin?: number;
  salaryMax?: number;
  page?: number;
  limit?: number;
}

export interface JobSearchResult {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

export interface JobRecommendation extends Job {
  matchScore: number;
  matchedResumeSkills: string[];
  missingKeywords: string[];
  weakSections: string[];
  explanation: string[];
  trackedApplication: {
    id: string;
    status: string;
  } | null;
}

export interface JobDiscoveryInput {
  resumeId: string;
  query?: string;
  location?: string;
  remoteType?: RemoteType;
  limit?: number;
}

export interface JobDiscoveryResult {
  resumeId: string;
  generatedAt: string;
  requestedLimit: number;
  totalCandidates: number;
  searchProfile: {
    roles: string[];
    skills: string[];
  };
  filters: {
    query: string | null;
    location: string | null;
    remoteType: RemoteType | null;
  };
  sourceRefresh: Array<{
    source: 'greenhouse' | 'lever' | 'ashby';
    identifier: string;
    status: 'refreshed' | 'cached' | 'failed';
    ingested?: number;
  }>;
  jobs: JobRecommendation[];
}

export function useJobs(params: JobSearchParams = {}) {
  return useQuery<JobSearchResult>({
    queryKey: ['jobs', params],
    queryFn: () => apiClient.get('/jobs/search', { ...params }),
  });
}

export function useJob(id: string) {
  return useQuery<Job>({
    queryKey: ['jobs', id],
    queryFn: () => apiClient.get(`/jobs/${id}`),
    enabled: Boolean(id),
  });
}

export function useJobDiscovery() {
  return useMutation({
    mutationFn: (input: JobDiscoveryInput) =>
      apiClient.post<JobDiscoveryResult>('/jobs/discover', {
        ...input,
        limit: Math.min(20, input.limit ?? 20),
      }),
  });
}
