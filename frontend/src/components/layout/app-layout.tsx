import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth';
import { useWarehouses } from './warehouse-switcher';
import { StorePickerModal } from './store-picker-modal';
import { PrintPreviewDialog } from '@/components/print-preview-dialog';
import { StaleDayGuard } from './stale-day-guard';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <AuthenticatedShell />;
}

function AuthenticatedShell() {
  // Keeps the current-warehouse store pointed at the default warehouse for
  // every page (POS, Products, Purchases) — there is no top-bar picker for
  // this one; the storefront switcher below is a separate, higher-level
  // "which store am I viewing" concept.
  useWarehouses();

  // A role's permissions can change at any time (a store admin ticking a
  // box in Module Access) — the logged-in session has no other way to
  // learn about it, since permissions are only ever attached at login. A
  // fresh fetch on every app load means a page reload is enough to pick
  // up the change, instead of requiring a full log-out/log-in.
  const refreshUser = useAuthStore((s) => s.refreshUser);
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background pt-[env(safe-area-inset-top)] print:block print:h-auto print:overflow-visible print:pt-0">
      <div className="no-print">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="no-print">
          <Header />
        </div>
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
      <StorePickerModal />
      <PrintPreviewDialog />
      <StaleDayGuard />
    </div>
  );
}
