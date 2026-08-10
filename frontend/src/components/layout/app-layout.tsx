import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth';
import { useWarehouses } from './warehouse-switcher';
import { StorePickerModal } from './store-picker-modal';

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

  return (
    <div className="flex h-screen overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
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
    </div>
  );
}
