import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  FileText,
  MoreHorizontal,
  QrCode,
  Search,
  Pencil,
  RotateCcw,
  Wallet,
  Undo2,
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
import { ReturnProductDialog } from '@/components/return-product-dialog';
import { SaleReturnsDialog } from '@/components/sale-returns-dialog';
import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { openSaleInvoicePopup } from '@/lib/invoicePopup';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter } from '@/store/storefront';
import { useWarehouses } from '@/components/layout/warehouse-switcher';
import { useLanguage } from '@/components/language-provider';

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
  previousBalance?: number | null;
  totalRemaining?: number | null;
  transportFare?: string;
  labourRentTotal?: string;
  labour?: { id: string; name: string; phone?: string; rent: number }[];
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  paymentMethod: string;
  status: string;
  customer?: { name: string };
  storeId?: string;
  storeName?: string;
  items: SaleItem[];
  returnedTotal?: number;
  gatePassId?: string;
  gatePassQrUrl?: string;
  warehouseGatePasses?: { warehouseId: string; gatePassId: string; gatePassQrUrl?: string }[];
  vendorGatePassId?: string;
  vendorGatePassQrUrl?: string;
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const canManageSales = grantsPermission(authUser?.permissions, 'sales:update');
  const { warehouses } = useWarehouses();

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
  });
  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Set from a DropdownMenuItem click — either a sale's own gate pass or one
  // of a return's, so a single dialog instance below handles both.
  const [openGatePass, setOpenGatePass] = useState<{
    id: string;
    qrUrl?: string;
    title: string;
  } | null>(null);
  const [returningSale, setReturningSale] = useState<Sale | null>(null);
  const [viewingReturnsFor, setViewingReturnsFor] = useState<Sale | null>(null);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);

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
      // Only sales with returns need the extra round trip — everything else
      // prints immediately with no returns section.
      const returns =
        Number(s.returnedTotal) > 0
          ? ((await api.get(`/sales/${s.id}/returns`)).data as {
              number: string;
              date: string;
              items: { name: string; quantity: number; lineTotal: number }[];
            }[])
          : [];
      await openSaleInvoicePopup(
        {
          ...s,
          returns: returns.map((r) => ({
            number: r.number,
            date: r.date,
            items: r.items.map((it) => ({
              name: it.name,
              quantity: it.quantity,
              amount: it.lineTotal,
            })),
          })),
        },
        win,
      );
    } catch {
      toast.error('Enable popups to view the printable invoice');
    }
  };

  return (
    <div className="space-y-4">
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
            <div className="w-64 space-y-1.5">
              <Label>{t('Search')}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Search by sale # or customer…')}
                  className="pl-8"
                />
              </div>
            </div>
            <Button asChild>
              <Link to="/pos">
                <ShoppingCart className="h-4 w-4" /> {t('New Sale (POS)')}
              </Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Sale #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Customer')}</th>
                <th className="px-4 py-3 font-medium">{t('Store')}</th>
                <th className="px-4 py-3 font-medium">{t('Payment')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Advance Payment')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Remaining Amount')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Total Amount')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
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
                          Number(s.balanceDue) > 0 ? 'font-medium text-destructive' : 'text-success'
                        }
                      >
                        {formatCurrency(Number(s.balanceDue))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(s.grandTotal))}
                      {Number(s.returnedTotal) > 0 && (
                        <div className="mt-0.5 text-xs font-normal text-destructive">
                          {t('Returned')} {formatCurrency(Number(s.returnedTotal))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Actions')}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleViewInvoice(s)}>
                            <FileText className="h-4 w-4" /> View Invoice
                          </DropdownMenuItem>
                          {(s.warehouseGatePasses ?? []).map((g) => {
                            const wh = warehouses.find((w) => w.id === g.warehouseId);
                            const multiple = (s.warehouseGatePasses?.length ?? 0) > 1;
                            const label = multiple
                              ? `${t('Gate Pass')} — ${wh?.name ?? t('Warehouse')}`
                              : t('Gate Pass');
                            return (
                              <DropdownMenuItem
                                key={g.gatePassId}
                                onSelect={() =>
                                  setOpenGatePass({
                                    id: g.gatePassId,
                                    qrUrl: g.gatePassQrUrl,
                                    title: label,
                                  })
                                }
                              >
                                <QrCode className="h-4 w-4" /> {t('View')} {label}
                              </DropdownMenuItem>
                            );
                          })}
                          {s.vendorGatePassId && (
                            <DropdownMenuItem
                              onSelect={() =>
                                setOpenGatePass({
                                  id: s.vendorGatePassId!,
                                  qrUrl: s.vendorGatePassQrUrl,
                                  title: t('Vendor Gate Pass'),
                                })
                              }
                            >
                              <QrCode className="h-4 w-4" /> {t('View Gate Pass (Vendor)')}
                            </DropdownMenuItem>
                          )}
                          {Number(s.returnedTotal) > 0 && (
                            <DropdownMenuItem onSelect={() => setViewingReturnsFor(s)}>
                              <Undo2 className="h-4 w-4" /> {t('View Returns')}
                            </DropdownMenuItem>
                          )}
                          {canManageSales && (
                            <>
                              <DropdownMenuItem
                                disabled={Number(s.returnedTotal) > 0}
                                title={
                                  Number(s.returnedTotal) > 0
                                    ? t('Sales with returns against them can no longer be edited')
                                    : undefined
                                }
                                onSelect={() => navigate(`/sales/${s.id}/edit`)}
                              >
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

      <GatePassDialog
        gatePassId={openGatePass?.id}
        gatePassQrUrl={openGatePass?.qrUrl}
        title={openGatePass?.title}
        open={openGatePass !== null}
        onOpenChange={(o) => !o && setOpenGatePass(null)}
      />

      <SaleReturnsDialog
        sale={viewingReturnsFor}
        open={viewingReturnsFor !== null}
        onOpenChange={(o) => !o && setViewingReturnsFor(null)}
        onViewGatePass={setOpenGatePass}
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
            storeId: payingSale.storeId,
          }
        }
        open={payingSale !== null}
        onOpenChange={(o) => !o && setPayingSale(null)}
      />
    </div>
  );
}
