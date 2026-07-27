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
  resumeVersion?: {
    id: string;
    optimizedText: string | null;
    matchScore: number | null;
    generatedAt: string;
  } | null;
  coverLetter?: {
    id: string;
    content: string;
    tone: string | null;
    createdAt: string;
  } | null;
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

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete<{ message: string }>(`/applications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  return { applications, create, update, remove };
}

export function useApplication(id: string) {
  const queryClient = useQueryClient();
  const application = useQuery<Application>({
    queryKey: ['applications', id],
    queryFn: () => apiClient.get(`/applications/${id}`),
    enabled: Boolean(id),
  });
  const addNote = useMutation({
    mutationFn: (note: string) =>
      apiClient.post<Application>(`/applications/${id}/notes`, { note }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications', id] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
  const update = useMutation({
    mutationFn: (status: ApplicationStatus) =>
      apiClient.patch<Application>(`/applications/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications', id] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => apiClient.delete<{ message: string }>(`/applications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
  return { application, addNote, update, remove };
}

export interface ApplicationUsage {
  used: number;
  maximum: number;
  unlimited: boolean;
  resetAt: string;
}

export function useApplicationUsage() {
  return useQuery<ApplicationUsage>({
    queryKey: ['applications', 'usage'],
    queryFn: () => apiClient.get('/applications/usage'),
  });
}

export function useApplicationTimeline(id: string) {
  return useQuery<{ id: string; timeline: Application['timeline'] }>({
    queryKey: ['applications', id, 'timeline'],
    queryFn: () => apiClient.get(`/applications/${id}/timeline`),
    enabled: Boolean(id),
  });
}
