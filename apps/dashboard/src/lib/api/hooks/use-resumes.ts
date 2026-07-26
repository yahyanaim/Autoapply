import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/api-client';

export interface Resume {
  id: string;
  userId: string;
  originalFileUrl: string;
  parsedJson: Record<string, unknown> | null;
  parseStatus: 'pending' | 'processing' | 'ready' | 'failed';
  parseError: string | null;
  isPrimary: boolean;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OptimizeResult {
  versionId: string;
  optimizedText: string;
  matchScore: number;
  missingKeywords: string[];
  weakSections: string[];
  fabrications: unknown[];
}

export function useResumes() {
  const queryClient = useQueryClient();

  const resumes = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes'),
    refetchInterval: (query) =>
      query.state.data?.some((resume) =>
        resume.parseStatus === 'pending' || resume.parseStatus === 'processing',
      )
        ? 2_000
        : false,
  });

  const upload = useMutation({
    mutationFn: (file: File) => apiClient.upload<Resume>('/resumes', file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resumes'] }),
  });

  const optimize = useMutation({
    mutationFn: ({ resumeId, jobId }: { resumeId: string; jobId: string }) =>
      apiClient.post<OptimizeResult>(`/resumes/${resumeId}/optimize`, { jobId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resumes'] }),
  });

  const remove = useMutation({
    mutationFn: (resumeId: string) => apiClient.delete<Resume>(`/resumes/${resumeId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resumes'] }),
  });

  return { resumes, upload, optimize, remove };
}

export function useResume(id: string) {
  return useQuery<Resume>({
    queryKey: ['resumes', id],
    queryFn: () => apiClient.get(`/resumes/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.parseStatus === 'pending' ||
      query.state.data?.parseStatus === 'processing'
        ? 2_000
        : false,
  });
}
