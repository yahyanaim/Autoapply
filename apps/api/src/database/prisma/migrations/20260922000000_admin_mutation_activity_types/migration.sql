ALTER TYPE "ActivityType"
ADD VALUE IF NOT EXISTS 'admin_user_suspend';

ALTER TYPE "ActivityType"
ADD VALUE IF NOT EXISTS 'admin_user_reactivate';

ALTER TYPE "ActivityType"
ADD VALUE IF NOT EXISTS 'admin_session_revoke';
