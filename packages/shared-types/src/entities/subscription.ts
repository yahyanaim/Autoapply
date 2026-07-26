import { SubscriptionPlan, SubscriptionStatus, PaymentStatus } from '../enums';

export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentId: string | null;
  invoiceUrl: string | null;
  createdAt: string;
}
