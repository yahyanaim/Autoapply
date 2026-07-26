import { NotificationChannel, NotificationStatus } from '../enums';

export interface Notification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  link: string | null;
  status: NotificationStatus;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}
