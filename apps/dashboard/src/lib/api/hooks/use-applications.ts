import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/api-client';
import type { Job } from './use-jobs';
import type { GeneratedResumeDocument } from './use-resumes';

export type ApplicationStatus = 'draft' | 'submitted' | 'viewed' | 'interview' | 'offer' | 'rejected';
export type ApplicationPreparationStatus =
  | 'job_captured'
  | 'analyzing'
  | 'generating'
  | 'ready_for_review'
  | 'ready_to_submit'
  | 'generation_failed';

export interface JobAnalysis {
  summary: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel: string;
  education: string[];
  languages: string[];
  keywords: string[];
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
  jobAnalysis: JobAnalysis | null;
  generationError: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  timeline: Array<{ status?: ApplicationStatus; type?: string; timestamp: string; note?: string }> | null;
  createdAt: string;
  updatedAt: string;
  job: Job;
  resumeVersion?: {
    id: string;
    resumeId: string;
    optimizedText: string | null;
    documentJson: GeneratedResumeDocument | null;
    matchScore: number | null;
    missingKeywords: string[];
    weakSections: string[];
    generatedAt: string;
  } | null;
  coverLetter?: {
    id: string;
    content: string;
    tone: string | null;
    generatedAt: string;
    updatedAt: string;
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

  const prepare = useMutation({
    mutationFn: (input: { jobId: string; resumeId: string }) =>
      apiClient.post<Application>('/applications/prepare', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
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

  return { applications, create, prepare, update, remove };
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
  const updateMaterials = useMutation({
    mutationFn: (input: {
      profile?: string;
      experience?: Array<{
        index: number;
        description: string;
        highlights: string[];
      }>;
      projects?: Array<{ index: number; description: string }>;
      coverLetter?: string;
    }) => apiClient.patch<Application>(`/applications/${id}/materials`, input),
    onSuccess: () => invalidateApplication(queryClient, id),
  });
  const regenerate = useMutation({
    mutationFn: (target: 'resume' | 'cover_letter' | 'all') =>
      apiClient.post<Application>(`/applications/${id}/regenerate`, { target }),
    onSuccess: () => invalidateApplication(queryClient, id),
  });
  const approve = useMutation({
    mutationFn: () =>
      apiClient.post<Application>(`/applications/${id}/approve`),
    onSuccess: () => invalidateApplication(queryClient, id),
  });
  const downloadPdf = useMutation({
    mutationFn: (input: { resumeId: string; versionId: string }) =>
      apiClient.getBlob(
        `/resumes/${input.resumeId}/versions/${input.versionId}/pdf`,
      ),
  });
  return {
    application,
    addNote,
    update,
    updateMaterials,
    regenerate,
    approve,
    downloadPdf,
    remove,
  };
}

function invalidateApplication(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
) {
  void queryClient.invalidateQueries({ queryKey: ['applications', id] });
  void queryClient.invalidateQueries({ queryKey: ['applications'] });
  void queryClient.invalidateQueries({ queryKey: ['resume-versions'] });
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
