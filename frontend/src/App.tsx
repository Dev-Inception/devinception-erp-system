import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/layout/app-layout';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { PosPage } from '@/pages/pos';
import { ProductsPage } from '@/pages/products';
import { PurchasesPage } from '@/pages/purchases';
import { VendorsPage } from '@/pages/vendors';
import { CustomersPage } from '@/pages/customers';
import { SalesPage } from '@/pages/sales';
import { SettingsPage } from '@/pages/settings';
import { CashPage } from '@/pages/cash';
import { LedgersPage } from '@/pages/ledgers';
import { InvoicesPage } from '@/pages/invoices';
import { ReportsPage } from '@/pages/reports';
import { WarehousesPage } from '@/pages/warehouses';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="warehouses" element={<WarehousesPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="ledgers" element={<LedgersPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="cash" element={<CashPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
