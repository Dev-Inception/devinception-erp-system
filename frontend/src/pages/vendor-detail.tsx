import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, HandCoins, Printer, QrCode, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { PayVendorDialog } from '@/components/pay-vendor-dialog';
import { VendorReceivablePaymentDialog } from '@/components/vendor-receivable-payment-dialog';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { openVendorSaleInvoicePopup, type VendorSaleItemsForInvoice } from '@/lib/invoicePopup';
import { VendorSaleDetailDialog, type VendorSale } from '@/pages/vendor-sales';

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  outstanding: number;
}
interface LedgerRow {
  date: string;
  description?: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}
interface PendingEntity {
  id: string;
  sourceType: 'SALE_ITEM' | 'STOCK_RECEIPT_ITEM';
  sourceNo: string;
  sale?: string;
  productName: string;
  quantity: number;
  date: string;
  status: 'PENDING' | 'PRICED';
  purchasePrice?: number;
  lineTotal?: number;
}
interface SaleRow {
  id: string;
  saleNumber: string;
  date: string;
  storeId?: string;
  storeName?: string;
  storeAddress?: string;
  customer?: { name: string; phone?: string };
  paymentMethod?: string;
  items: { name: string; quantity: number; unitPrice: number; amount: number; vendorId?: string }[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  transportFare?: number;
  labourRentTotal?: number;
  grandTotal: number;
  paidAmount?: number;
  balanceDue?: number;
  previousBalance?: number | null;
  totalRemaining?: number | null;
  returnedTotal?: number;
  vendorGatePassId?: string;
  vendorGatePassQrUrl?: string;
}

const TABS = ['statement', 'purchases', 'sales', 'vendor-sales'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  statement: 'Statement',
  purchases: 'Purchases',
  sales: 'Sales (Vendor Items)',
  'vendor-sales': 'Sales to Vendor',
};

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const storefront = useStorefrontFilter();
  const [tab, setTab] = useState<Tab>('statement');
  const [payingVendor, setPayingVendor] = useState(false);
  const [receivablePayment, setReceivablePayment] = useState<'IN' | 'OUT' | null>(null);
  const [viewingVendorSale, setViewingVendorSale] = useState<VendorSale | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [viewingGatePass, setViewingGatePass] = useState<{
    gatePassId?: string;
    gatePassQrUrl?: string;
    title: string;
  } | null>(null);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors', storefront.store],
    queryFn: async () => (await api.get('/vendors', { params: storefront })).data,
  });
  const vendor = vendors.find((v) => v.id === id);

  const { data: ledger } = useQuery<{ balance: number; opening: number; entries: LedgerRow[] }>({
    queryKey: ['vendor-ledger', id, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get(`/vendors/${id}/ledger`, {
          params: { from: from || undefined, to: to || undefined, ...storefront },
        })
      ).data,
    enabled: !!id && tab === 'statement',
  });

  const { data: receivableLedger } = useQuery<{
    balance: number;
    opening: number;
    entries: LedgerRow[];
  }>({
    queryKey: ['vendor-receivable-ledger', id, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get(`/vendors/${id}/receivable-ledger`, {
          params: { from: from || undefined, to: to || undefined, ...storefront },
        })
      ).data,
    enabled: !!id && tab === 'vendor-sales',
  });

  const { data: vendorSalesData, isLoading: vendorSalesLoading } = useQuery<{
    vendorSales: VendorSale[];
  }>({
    queryKey: ['vendor-sales-for-vendor', id, storefront.store],
    queryFn: async () =>
      (await api.get('/vendor-sales', { params: { vendorId: id, limit: 200, ...storefront } }))
        .data,
    enabled: !!id && tab === 'vendor-sales',
  });
  const vendorSalesForVendor = vendorSalesData?.vendorSales ?? [];

  const { data: purchasesData, isLoading: purchasesLoading } = useQuery<{
    entities: PendingEntity[];
  }>({
    queryKey: ['vendor-pending-entities', id],
    queryFn: async () =>
      (await api.get('/pending-entities', { params: { vendorId: id, limit: 200 } })).data,
    enabled: !!id && tab === 'purchases',
  });
  const purchases = purchasesData?.entities ?? [];

  const { data: salesData, isLoading: salesLoading } = useQuery<{ sales: SaleRow[] }>({
    queryKey: ['vendor-sales', id, storefront.store],
    queryFn: async () =>
      (await api.get('/sales', { params: { vendorId: id, limit: 200, ...storefront } })).data,
    enabled: !!id && tab === 'sales',
  });
  const vendorSales = (salesData?.sales ?? [])
    .map((s) => ({ ...s, vendorItems: s.items.filter((it) => it.vendorId === id) }))
    .filter((s) => s.vendorItems.length > 0);

  const handlePrintVendorInvoice = async (s: SaleRow & { vendorItems: SaleRow['items'] }) => {
    const win = window.open('', '_blank', 'width=850,height=1000');
    win?.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#666">Preparing invoice…</p>',
    );
    try {
      const pricing = (
        await api.get('/pending-entities', {
          params: { vendorId: id, sourceType: 'SALE_ITEM', limit: 500 },
        })
      ).data as { entities: PendingEntity[] };
      const pricedByProduct = new Map(
        pricing.entities.filter((e) => e.sale === s.id).map((e) => [e.productName, e]),
      );
      const items = s.vendorItems.map((it) => {
        const priced = pricedByProduct.get(it.name);
        return {
          name: it.name,
          quantity: it.quantity,
          purchasePrice: priced?.purchasePrice,
          lineTotal: priced?.lineTotal,
          pricingStatus: priced?.status,
        };
      });
      const payload: VendorSaleItemsForInvoice = {
        saleNumber: s.saleNumber,
        date: s.date,
        storeId: s.storeId,
        storeName: s.storeName,
        storeAddress: s.storeAddress,
        vendorName: vendor?.name ?? 'Vendor',
        vendorPhone: vendor?.phone,
        items,
        pricedTotal: items.reduce((sum, it) => sum + Number(it.lineTotal ?? 0), 0),
      };
      await openVendorSaleInvoicePopup(payload, win);
    } catch {
      toast.error('Enable popups to view the printable invoice');
    }
  };

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/vendors')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('Back to Vendors')}
      </button>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <CardTitle className="text-xl">{vendor?.name ?? '…'}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[vendor?.phone, vendor?.email, vendor?.ntn, vendor?.address]
                .filter(Boolean)
                .join(' · ') || t('No contact details')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">{t('Outstanding')}</p>
              <p className="text-lg font-semibold">{formatCurrency(vendor?.outstanding ?? 0)}</p>
            </div>
            <Button onClick={() => setPayingVendor(true)} disabled={!vendor}>
              <Banknote className="h-4 w-4" /> {t('Pay Vendor')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === tabKey ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t(TAB_LABEL[tabKey])}
          </button>
        ))}
      </div>

      {tab === 'statement' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4 space-y-0">
            <p className="text-sm text-muted-foreground">
              {from && (
                <>
                  {t('Opening balance')}:{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(ledger?.opening ?? 0)}
                  </span>{' '}
                  ·{' '}
                </>
              )}
              {from || to ? t('Closing balance') : t('Current balance')}:{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(ledger?.balance ?? 0)}
              </span>
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('From')}</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('To')}</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('Date')}</th>
                    <th className="px-4 py-2 font-medium">{t('Description')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Debit')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Credit')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger?.entries ?? []).map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">{e.description ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {e.debit ? formatCurrency(e.debit) : ''}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {e.credit ? formatCurrency(e.credit) : ''}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatCurrency(e.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                  {ledger && ledger.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        {t('No transactions yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'purchases' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('Source')}</th>
                  <th className="px-4 py-3 font-medium">{t('Doc #')}</th>
                  <th className="px-4 py-3 font-medium">{t('Date')}</th>
                  <th className="px-4 py-3 font-medium">{t('Product')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Qty')}</th>
                  <th className="px-4 py-3 font-medium">{t('Status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Price')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {purchasesLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {t('Loading…')}
                    </td>
                  </tr>
                )}
                {!purchasesLoading &&
                  purchases.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.sourceType === 'SALE_ITEM'
                          ? t('Sale (vendor item)')
                          : t('Stock receipt')}
                      </td>
                      <td className="px-4 py-3 font-medium">{e.sourceNo}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{e.productName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{e.quantity}</td>
                      <td className="px-4 py-3">
                        <span className={e.status === 'PRICED' ? 'text-success' : 'text-blue-500'}>
                          {e.status === 'PRICED' ? t('Priced') : t('Pending')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {e.purchasePrice !== undefined ? formatCurrency(e.purchasePrice) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {e.lineTotal !== undefined ? formatCurrency(e.lineTotal) : '—'}
                      </td>
                    </tr>
                  ))}
                {!purchasesLoading && purchases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {t('Nothing purchased from this vendor yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {t('Pending items are priced from the')}{' '}
            <Link to="/pending-entities" className="underline">
              {t('Pending Entities')}
            </Link>{' '}
            {t('page.')}
          </p>
        </Card>
      )}

      {tab === 'sales' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('Sale #')}</th>
                  <th className="px-4 py-3 font-medium">{t('Date')}</th>
                  <th className="px-4 py-3 font-medium">{t('Items')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Qty')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {salesLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {t('Loading…')}
                    </td>
                  </tr>
                )}
                {!salesLoading &&
                  vendorSales.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{s.saleNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(s.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">{s.vendorItems.map((it) => it.name).join(', ')}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.vendorItems.reduce((sum, it) => sum + Number(it.quantity), 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t('Print Vendor Invoice')}
                            onClick={() => handlePrintVendorInvoice(s)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {s.vendorGatePassId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={t('View Gate Pass')}
                              onClick={() =>
                                setViewingGatePass({
                                  gatePassId: s.vendorGatePassId,
                                  gatePassQrUrl: s.vendorGatePassQrUrl,
                                  title: s.saleNumber,
                                })
                              }
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                {!salesLoading && vendorSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {t('No sales sourced from this vendor yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'vendor-sales' && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('They owe us')}</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(receivableLedger?.balance ?? 0)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setReceivablePayment('IN')} disabled={!vendor}>
                  <HandCoins className="h-4 w-4" /> {t('Receive Payment')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReceivablePayment('OUT')}
                  disabled={!vendor}
                >
                  <Undo2 className="h-4 w-4" /> {t('Refund')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3 text-sm font-medium">
              {t('Sales to this vendor')}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t('Sale #')}</th>
                    <th className="px-4 py-3 font-medium">{t('Date')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('Items')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                    <th className="px-4 py-3 font-medium">{t('Payment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorSalesLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        {t('Loading…')}
                      </td>
                    </tr>
                  )}
                  {!vendorSalesLoading &&
                    vendorSalesForVendor.map((s) => (
                      <tr
                        key={s.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                        onClick={() => setViewingVendorSale(s)}
                      >
                        <td className="px-4 py-3 font-medium">{s.number}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(s.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {s.items.length}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatCurrency(s.total)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.paymentMethod}</td>
                      </tr>
                    ))}
                  {!vendorSalesLoading && vendorSalesForVendor.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        {t('This vendor has not bought anything from us yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4 space-y-0">
              <p className="text-sm text-muted-foreground">
                {from && (
                  <>
                    {t('Opening balance')}:{' '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(receivableLedger?.opening ?? 0)}
                    </span>{' '}
                    ·{' '}
                  </>
                )}
                {from || to ? t('Closing balance') : t('Current balance')}:{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(receivableLedger?.balance ?? 0)}
                </span>
              </p>
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('From')}</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-8 w-36 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('To')}</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-8 w-36 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2 font-medium">{t('Date')}</th>
                      <th className="px-4 py-2 font-medium">{t('Description')}</th>
                      <th className="px-4 py-2 text-right font-medium">{t('Debit')}</th>
                      <th className="px-4 py-2 text-right font-medium">{t('Credit')}</th>
                      <th className="px-4 py-2 text-right font-medium">{t('Balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(receivableLedger?.entries ?? []).map((e, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(e.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{e.description ?? '—'}</td>
                        <td className="px-4 py-2 text-right">
                          {e.debit ? formatCurrency(e.debit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {e.credit ? formatCurrency(e.credit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatCurrency(e.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                    {receivableLedger && receivableLedger.entries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          {t('No transactions yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <PayVendorDialog
        vendor={
          vendor ? { id: vendor.id, name: vendor.name, outstanding: vendor.outstanding } : null
        }
        open={payingVendor}
        onOpenChange={(o) => {
          setPayingVendor(o);
          if (!o) qc.invalidateQueries({ queryKey: ['vendor-ledger', id] });
        }}
      />
      <GatePassDialog
        gatePassId={viewingGatePass?.gatePassId}
        gatePassQrUrl={viewingGatePass?.gatePassQrUrl}
        title={viewingGatePass?.title}
        open={viewingGatePass !== null}
        onOpenChange={(o) => !o && setViewingGatePass(null)}
      />
      <VendorReceivablePaymentDialog
        vendor={
          vendor
            ? { id: vendor.id, name: vendor.name, balance: receivableLedger?.balance ?? 0 }
            : null
        }
        direction={receivablePayment ?? 'IN'}
        open={receivablePayment !== null}
        onOpenChange={(o) => {
          if (!o) setReceivablePayment(null);
        }}
      />
      {viewingVendorSale && (
        <VendorSaleDetailDialog
          sale={viewingVendorSale}
          onClose={() => setViewingVendorSale(null)}
        />
      )}
    </div>
  );
}
