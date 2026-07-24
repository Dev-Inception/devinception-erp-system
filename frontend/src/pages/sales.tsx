import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText, MoreHorizontal, QrCode, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { openSaleInvoicePopup } from '@/lib/invoicePopup';

interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: string | number;
  amount: string | number;
}

interface Sale {
  id: string;
  saleNumber: string;
  date: string;
  grandTotal: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  paidCash: string;
  paidBank: string;
  paymentMethod: string;
  status: string;
  customer?: { name: string };
  items: SaleItem[];
  gatePassId?: string;
  gatePassQrUrl?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Online',
  MIXED: 'Mixed',
  CARD: 'Card',
  CREDIT: 'Credit',
};

const PAGE_SIZE = 20;
// While searching, widen the fetch and search across that whole batch
// client-side instead of just the current 20-row page — otherwise typing a
// search term would silently only match whatever page happened to be loaded.
const SEARCH_FETCH_LIMIT = 200;

export function SalesPage() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [from, to, paymentMethod, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', from, to, paymentMethod, fetchPage, fetchLimit],
    queryFn: async () =>
      (
        await api.get('/sales', {
          params: {
            from,
            to,
            paymentMethod: paymentMethod || undefined,
            page: fetchPage,
            limit: fetchLimit,
          },
        })
      ).data as { sales: Sale[]; total: number; page: number; limit: number },
  });
  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [gatePassSale, setGatePassSale] = useState<Sale | null>(null);

  const filteredSales = isSearching
    ? sales.filter(
        (s) =>
          s.saleNumber?.toLowerCase().includes(q) ||
          (s.customer?.name ?? 'walk-in').toLowerCase().includes(q),
      )
    : sales;

  const handleViewInvoice = async (s: Sale) => {
    // Open synchronously so the browser ties the popup to this click rather
    // than treating it as an unrequested popup.
    const win = window.open('', '_blank', 'width=850,height=1000');
    win?.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#666">Preparing invoice…</p>',
    );
    try {
      await openSaleInvoicePopup(s, win);
    } catch {
      toast.error('Enable popups to view the printable invoice');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {isSearching ? filteredSales.length : total} sale(s)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All methods</option>
              {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by sale # or customer…"
              className="pl-8"
            />
          </div>
          <Button asChild>
            <Link to="/pos">
              <ShoppingCart className="h-4 w-4" /> New Sale (POS)
            </Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Sale #</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Cash</th>
              <th className="px-4 py-3 text-right font-medium">Online</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              filteredSales.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.saleNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(s.date).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.customer?.name ?? 'Walk-in'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Number(s.paidCash) > 0 ? formatCurrency(Number(s.paidCash)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Number(s.paidBank) > 0 ? formatCurrency(Number(s.paidBank)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(Number(s.grandTotal))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleViewInvoice(s)}>
                          <FileText className="h-4 w-4" /> View Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setGatePassSale(s)}>
                          <QrCode className="h-4 w-4" /> View Gate Pass
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            {!isLoading && isSearching && filteredSales.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No sales match “{search}”.
                </td>
              </tr>
            )}
            {!isLoading && total === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No sales yet — ring one up in the POS.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isSearching && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="border-t"
          />
        )}
      </Card>

      <GatePassDialog
        gatePassId={gatePassSale?.gatePassId}
        gatePassQrUrl={gatePassSale?.gatePassQrUrl}
        open={gatePassSale !== null}
        onOpenChange={(o) => !o && setGatePassSale(null)}
      />
    </div>
  );
}
