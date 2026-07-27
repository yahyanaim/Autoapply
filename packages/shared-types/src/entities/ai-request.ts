import { AIRequestFeature } from '../enums';

export interface AIRequest {
  id: string;
  userId: string;
  feature: AIRequestFeature;
  provider: string;
  model: string | null;
  promptVersion: string | null;
  tokensUsed: number | null;
  cost: number | null;
  latencyMs: number | null;
  inputHash: string | null;
  cached: boolean;
  createdAt: string;
}

export interface UsageLimit {
  id: string;
  userId: string;
  period: string;
  applicationsUsed: number;
  applicationsMax: number;
  aiRequestsUsed: number;
  aiRequestsMax: number;
  jobDiscoveriesUsed: number;
  jobDiscoveriesMax: number;
  resumesUsed: number;
  resumesMax: number;
  storageBytesUsed: number;
  storageBytesMax: number;
  resetAt: string;
}
