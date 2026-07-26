export enum UserRole {
  user = 'user',
  org_admin = 'org_admin',
  platform_admin = 'platform_admin',
}

export enum ApplicationStatus {
  draft = 'draft',
  submitted = 'submitted',
  viewed = 'viewed',
  interview = 'interview',
  offer = 'offer',
  rejected = 'rejected',
}

export enum SubscriptionPlan {
  free = 'free',
  pro = 'pro',
  premium = 'premium',
}

export enum SubscriptionStatus {
  active = 'active',
  canceled = 'canceled',
  past_due = 'past_due',
  trialing = 'trialing',
  incomplete = 'incomplete',
}

export enum PaymentStatus {
  succeeded = 'succeeded',
  pending = 'pending',
  failed = 'failed',
  refunded = 'refunded',
}

export enum AIRequestFeature {
  resume_parse = 'resume_parse',
  resume_optimize = 'resume_optimize',
  match_score = 'match_score',
  cover_letter = 'cover_letter',
  interview_coach = 'interview_coach',
  career_advisor = 'career_advisor',
  recruiter_chat = 'recruiter_chat',
}

export enum NotificationChannel {
  email = 'email',
  push = 'push',
  in_app = 'in_app',
}

export enum NotificationStatus {
  pending = 'pending',
  sent = 'sent',
  failed = 'failed',
  read = 'read',
}

export enum RemoteType {
  remote = 'remote',
  hybrid = 'hybrid',
  onsite = 'onsite',
}

export enum OAuthProvider {
  google = 'google',
  github = 'github',
}

export enum ActivityType {
  auth_login = 'auth_login',
  auth_logout = 'auth_logout',
  resume_upload = 'resume_upload',
  resume_optimize = 'resume_optimize',
  application_create = 'application_create',
  application_update = 'application_update',
  cover_letter_generate = 'cover_letter_generate',
  ai_request = 'ai_request',
  subscription_change = 'subscription_change',
  payment = 'payment',
}
