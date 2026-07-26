import { UserRole, OAuthProvider, RemoteType } from '../enums';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  fullName: string | null;
  headline: string | null;
  location: string | null;
  visaStatus: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  remotePreference: RemoteType | null;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerId: string;
  createdAt: string;
}
