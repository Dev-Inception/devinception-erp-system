import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  FileText,
  MoreHorizontal,
  QrCode,
  Search,
  Pencil,
  RotateCcw,
  Wallet,
} from 'lucide-react';
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
import { UpdateSaleDialog } from '@/components/update-sale-dialog';
import { ReturnProductDialog } from '@/components/return-product-dialog';
import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { openSaleInvoicePopup } from '@/lib/invoicePopup';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter } from '@/store/storefront';

interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string | number;
  amount: string | number;
  source?: 'WAREHOUSE' | 'VENDOR';
  vendorId?: string;
  vendorName?: string;
  warehouseId?: string;
}

interface Sale {
  id: string;
  saleNumber: string;
  date: string;
  grandTotal: string;
  subtotal: string;
  taxTotal: string;
  taxPercent: string;
  discountTotal: string;
  paidCash: string;
  paidBank: string;
  paidAmount: string;
  balanceDue: string;
  transportFare?: string;
  labourRentTotal?: string;
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  paymentMethod: string;
  status: string;
  customer?: { name: string };
  storeName?: string;
  items: SaleItem[];
  gatePassId?: string;
  gatePassQrUrl?: string;
}

interface SaleReturnItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface SaleReturn {
  id: string;
  number: string;
  saleId: string;
  saleNumber: string;
  customerName: string;
  date: string;
  items: SaleReturnItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  note?: string;
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
  const authUser = useAuthStore((s) => s.user);
  const canManageSales = grantsPermission(authUser?.permissions, 'sales:update');

  const [tab, setTab] = useState<'sales' | 'returns'>('sales');

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(1);
  const storefront = useStorefrontFilter();

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [from, to, paymentMethod, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', from, to, paymentMethod, fetchPage, fetchLimit, storefront.store],
    queryFn: async () =>
      (
        await api.get('/sales', {
          params: {
            from,
            to,
            paymentMethod: paymentMethod || undefined,
            page: fetchPage,
            limit: fetchLimit,
            ...storefront,
          },
        })
      ).data as { sales: Sale[]; total: number; page: number; limit: number },
    enabled: tab === 'sales',
  });
  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [gatePassSale, setGatePassSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [returningSale, setReturningSale] = useState<Sale | null>(null);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);

  const filteredSales = isSearching
    ? sales.filter(
        (s) =>
          s.saleNumber?.toLowerCase().includes(q) ||
          (s.customer?.name ?? 'walk-in').toLowerCase().includes(q),
      )
    : sales;

  // Sale Returns tab — its own filters/pagination, independent of the Sales
  // tab above, mirroring the same from/to + search pattern.
  const [returnSearch, setReturnSearch] = useState('');
  const [returnFrom, setReturnFrom] = useState('');
  const [returnTo, setReturnTo] = useState('');
  const [returnPage, setReturnPage] = useState(1);

  const returnQ = returnSearch.trim().toLowerCase();
  const isReturnSearching = returnQ.length > 0;
  const returnFetchPage = isReturnSearching ? 1 : returnPage;
  const returnFetchLimit = isReturnSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  useEffect(() => {
    setReturnPage(1);
  }, [returnFrom, returnTo, returnSearch]);

  const { data: returnData, isLoading: returnsLoading } = useQuery({
    queryKey: ['sale-returns', returnFrom, returnTo, returnFetchPage, returnFetchLimit],
    queryFn: async () =>
      (
        await api.get('/sales/returns', {
          params: {
            from: returnFrom,
            to: returnTo,
            page: returnFetchPage,
            limit: returnFetchLimit,
          },
        })
      ).data as { returns: SaleReturn[]; total: number; page: number; limit: number },
    enabled: tab === 'returns',
  });
  const returns = returnData?.returns ?? [];
  const returnTotal = returnData?.total ?? 0;
  const returnTotalPages = Math.max(1, Math.ceil(returnTotal / PAGE_SIZE));
  const filteredReturns = isReturnSearching
    ? returns.filter(
        (r) =>
          r.number?.toLowerCase().includes(returnQ) ||
          r.saleNumber?.toLowerCase().includes(returnQ) ||
          (r.customerName || 'walk-in').toLowerCase().includes(returnQ),
      )
    : returns;

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
      <div className="flex gap-1 border-b">
        {(
          [
            { key: 'sales', label: 'Sales' },
            { key: 'returns', label: 'Sale Returns' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <>
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
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Advance Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Remaining Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Total Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
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
                      <td className="px-4 py-3 text-muted-foreground">{s.storeName ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {Number(s.paidAmount) > 0 ? formatCurrency(Number(s.paidAmount)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={
                            Number(s.balanceDue) > 0
                              ? 'font-medium text-destructive'
                              : 'text-success'
                          }
                        >
                          {formatCurrency(Number(s.balanceDue))}
                        </span>
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
                            {canManageSales && (
                              <>
                                <DropdownMenuItem onSelect={() => setEditingSale(s)}>
                                  <Pencil className="h-4 w-4" /> Update Sale
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setReturningSale(s)}>
                                  <RotateCcw className="h-4 w-4" /> Return Product
                                </DropdownMenuItem>
                                {Number(s.balanceDue) > 0 && (
                                  <DropdownMenuItem onSelect={() => setPayingSale(s)}>
                                    <Wallet className="h-4 w-4" /> Record Payment
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                {!isLoading && isSearching && filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No sales match “{search}”.
                    </td>
                  </tr>
                )}
                {!isLoading && total === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
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
        </>
      )}

      {tab === 'returns' && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {isReturnSearching ? filteredReturns.length : returnTotal} return(s)
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input
                  type="date"
                  value={returnFrom}
                  onChange={(e) => setReturnFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input
                  type="date"
                  value={returnTo}
                  onChange={(e) => setReturnTo(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  placeholder="Search by return #, sale # or customer…"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Return #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Sale #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {returnsLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!returnsLoading &&
                  filteredReturns.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{r.number}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.saleNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.customerName || 'Walk-in'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.items.map((it) => `${it.name} ×${it.quantity}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(Number(r.total))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.note || '—'}</td>
                    </tr>
                  ))}
                {!returnsLoading && isReturnSearching && filteredReturns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No returns match “{returnSearch}”.
                    </td>
                  </tr>
                )}
                {!returnsLoading && returnTotal === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No returns recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!isReturnSearching && (
              <Pagination
                page={returnPage}
                totalPages={returnTotalPages}
                total={returnTotal}
                pageSize={PAGE_SIZE}
                onPageChange={setReturnPage}
                className="border-t"
              />
            )}
          </Card>
        </>
      )}

      <GatePassDialog
        gatePassId={gatePassSale?.gatePassId}
        gatePassQrUrl={gatePassSale?.gatePassQrUrl}
        open={gatePassSale !== null}
        onOpenChange={(o) => !o && setGatePassSale(null)}
      />

      <UpdateSaleDialog
        sale={
          editingSale && {
            id: editingSale.id,
            saleNumber: editingSale.saleNumber,
            items: editingSale.items.map((it) => ({
              productId: it.productId,
              name: it.name,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice),
              source: it.source,
              vendorId: it.vendorId,
              vendorName: it.vendorName,
              warehouseId: it.warehouseId,
            })),
            discountTotal: Number(editingSale.discountTotal),
            taxPercent: Number(editingSale.taxPercent),
            transportFare: Number(editingSale.transportFare ?? 0),
            labourRentTotal: Number(editingSale.labourRentTotal ?? 0),
            transport: editingSale.transport,
          }
        }
        open={editingSale !== null}
        onOpenChange={(o) => !o && setEditingSale(null)}
      />

      <ReturnProductDialog
        sale={
          returningSale && {
            id: returningSale.id,
            saleNumber: returningSale.saleNumber,
            items: returningSale.items.map((it) => ({
              productId: it.productId,
              name: it.name,
              quantity: it.quantity,
            })),
          }
        }
        open={returningSale !== null}
        onOpenChange={(o) => !o && setReturningSale(null)}
      />

      <RecordPaymentDialog
        sale={
          payingSale && {
            id: payingSale.id,
            saleNumber: payingSale.saleNumber,
            balanceDue: Number(payingSale.balanceDue),
          }
        }
        open={payingSale !== null}
        onOpenChange={(o) => !o && setPayingSale(null)}
      />
    </div>
  );
}
