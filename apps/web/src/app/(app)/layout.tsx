import { AppShell } from '@/components/app-shell';
import { MeProvider } from '@/components/me';
import { Toaster } from '@/components/ui/sonner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AppShell>{children}</AppShell>
      <Toaster position="top-center" />
    </MeProvider>
  );
}
