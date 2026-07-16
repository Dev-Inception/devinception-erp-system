import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/layout/app-layout';
import { useAuthStore } from '@/store/auth';
import { MODULES, canSeeModule, landingPath } from '@/lib/modules';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { PosPage } from '@/pages/pos';
import { ProductsPage } from '@/pages/products';
import { CategoriesPage } from '@/pages/categories';
import { UnitsPage } from '@/pages/units';
import { PurchasesPage } from '@/pages/purchases';
import { VendorsPage } from '@/pages/vendors';
import { LabourPage } from '@/pages/labour';
import { CustomersPage } from '@/pages/customers';
import { SalesPage } from '@/pages/sales';
import { SettingsPage } from '@/pages/settings';
import { CashPage } from '@/pages/cash';
import { LedgersPage } from '@/pages/ledgers';
import { InvoicesPage } from '@/pages/invoices';
import { ReportsPage } from '@/pages/reports';
import { WarehousesPage } from '@/pages/warehouses';
import { PermissionsPage } from '@/pages/permissions';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/**
 * The index route ('/'). Shows the dashboard when the user can see it, otherwise
 * redirects to their first accessible module — so a cashier who can't open the
 * dashboard doesn't land on a forbidden page (on login, refresh or direct nav).
 */
function IndexRoute() {
  const user = useAuthStore((s) => s.user);
  const dashboard = MODULES.find((m) => m.key === 'dashboard')!;
  if (canSeeModule(user?.role, user?.permissions, dashboard)) return <DashboardPage />;
  const to = landingPath(user?.role, user?.permissions);
  // Guard against a redirect loop in the degenerate "no visible module" case.
  return to === '/' ? <DashboardPage /> : <Navigate to={to} replace />;
}

/**
 * Guards a module route: renders the page only if the user can see that module,
 * otherwise redirects to their landing path — so typing (or bookmarking) a URL
 * for a module the role can't access never lands on a forbidden page.
 */
function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const m = MODULES.find((mod) => mod.key === moduleKey);
  if (m && canSeeModule(user?.role, user?.permissions, m)) return <>{children}</>;
  return <Navigate to={landingPath(user?.role, user?.permissions)} replace />;
}

/** Module routes ('/' is handled separately by IndexRoute). Path === module key. */
const MODULE_ROUTES: { path: string; element: React.ReactElement }[] = [
  { path: 'pos', element: <PosPage /> },
  { path: 'products', element: <ProductsPage /> },
  { path: 'categories', element: <CategoriesPage /> },
  { path: 'units', element: <UnitsPage /> },
  { path: 'warehouses', element: <WarehousesPage /> },
  { path: 'sales', element: <SalesPage /> },
  { path: 'purchases', element: <PurchasesPage /> },
  { path: 'invoices', element: <InvoicesPage /> },
  { path: 'customers', element: <CustomersPage /> },
  { path: 'vendors', element: <VendorsPage /> },
  { path: 'labour', element: <LabourPage /> },
  { path: 'ledgers', element: <LedgersPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'cash', element: <CashPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'permissions', element: <PermissionsPage /> },
];

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<IndexRoute />} />
              {MODULE_ROUTES.map((r) => (
                <Route
                  key={r.path}
                  path={r.path}
                  element={<ModuleGuard moduleKey={r.path}>{r.element}</ModuleGuard>}
                />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
