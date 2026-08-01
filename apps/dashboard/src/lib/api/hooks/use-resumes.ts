import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { apiClient } from '@/lib/api/api-client';
import { createMutationIdempotencyStore } from '@/lib/api/mutation-idempotency';

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
  truthfulness: TruthfulnessReport;
  document: GeneratedResumeDocument;
}

export type ClaimClassification =
  'supported' | 'safe_rewording' | 'needs_confirmation' | 'unsupported_blocked';

export interface TruthfulnessFinding {
  classification: ClaimClassification;
  type:
    | 'experience'
    | 'title'
    | 'date'
    | 'skill'
    | 'education'
    | 'certification'
    | 'metric'
    | 'language'
    | 'project'
    | 'narrative';
  section: string;
  detail: string;
  original?: string;
  proposed?: string;
}

export interface TruthfulnessReport {
  status: 'passed' | 'review_required' | 'blocked';
  summary: Record<ClaimClassification, number>;
  findings: TruthfulnessFinding[];
}

export interface GeneratedResumeDocument {
  template: 'classic-ats-v1';
  contact: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedInUrl?: string;
    portfolioUrl?: string;
  };
  profile: string;
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    description: string;
    highlights: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  skills: string[];
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string;
  }>;
  certifications: string[];
  languages: string[];
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  jobId: string | null;
  optimizedText: string | null;
  documentJson: GeneratedResumeDocument | null;
  matchScore: number | null;
  missingKeywords: string[];
  weakSections: string[];
  generatedAt: string;
  truthfulness: TruthfulnessReport | null;
}

export function useResumes() {
  const queryClient = useQueryClient();
  const optimizeIdempotency = useRef(
    createMutationIdempotencyStore('resume-optimize'),
  ).current;

  const resumes = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes'),
    refetchInterval: (query) =>
      query.state.data?.some(
        (resume) =>
          resume.parseStatus === 'pending' ||
          resume.parseStatus === 'processing',
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
      apiClient.post<OptimizeResult>(
        `/resumes/${resumeId}/optimize`,
        { jobId },
        {
          'Idempotency-Key': optimizeIdempotency.keyFor({
            resumeId,
            jobId,
          }),
        },
      ),
    onSuccess: (_result, variables) => {
      optimizeIdempotency.clear(variables);
      void queryClient.invalidateQueries({ queryKey: ['resumes'] });
      void queryClient.invalidateQueries({
        queryKey: ['resume-versions', variables.resumeId],
      });
    },
  });

  const remove = useMutation({
    mutationFn: (resumeId: string) =>
      apiClient.delete<Resume>(`/resumes/${resumeId}`),
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

export function useResumeVersions(resumeId: string) {
  const versions = useQuery<ResumeVersion[]>({
    queryKey: ['resume-versions', resumeId],
    queryFn: () => apiClient.get(`/resumes/${resumeId}/versions`),
    enabled: Boolean(resumeId),
  });

  const downloadPdf = useMutation({
    mutationFn: (versionId: string) =>
      apiClient.getBlob(`/resumes/${resumeId}/versions/${versionId}/pdf`),
  });

  return { versions, downloadPdf };
}
