import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/api-client';
import type { Job } from './use-jobs';

export type ApplicationStatus = 'draft' | 'submitted' | 'viewed' | 'interview' | 'offer' | 'rejected';

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  resumeVersionId: string | null;
  coverLetterId: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  timeline: Array<{ status?: ApplicationStatus; type?: string; timestamp: string; note?: string }> | null;
  createdAt: string;
  updatedAt: string;
  job: Job;
}

interface ApplicationsResponse {
  applications: Application[];
  total: number;
  page: number;
  limit: number;
}

export function useApplications(filters?: { status?: ApplicationStatus; page?: number; limit?: number }) {
  const queryClient = useQueryClient();
  const applications = useQuery<ApplicationsResponse>({
    queryKey: ['applications', filters],
    queryFn: () => apiClient.get('/applications', filters),
  });

  const create = useMutation({
    mutationFn: (input: { jobId: string; resumeVersionId?: string; coverLetterId?: string }) =>
      apiClient.post<Application>('/applications', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      apiClient.patch<Application>(`/applications/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  return { applications, create, update };
}

export function useApplicationTimeline(id: string) {
  return useQuery<{ id: string; timeline: Application['timeline'] }>({
    queryKey: ['applications', id, 'timeline'],
    queryFn: () => apiClient.get(`/applications/${id}/timeline`),
    enabled: Boolean(id),
  });
}
