import { AdminConsoleShell } from '@/components/admin/AdminConsoleShell';

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminConsoleShell>{children}</AdminConsoleShell>;
}
