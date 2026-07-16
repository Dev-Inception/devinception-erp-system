import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth';
import { useWarehouses } from './warehouse-switcher';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <AuthenticatedShell />;
}

function AuthenticatedShell() {
  // Keeps the current-warehouse store pointed at the default warehouse for
  // every page (POS, Products, Purchases) — there is no top-bar picker anymore.
  useWarehouses();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
