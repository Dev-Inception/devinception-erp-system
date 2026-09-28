import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Printer,
  Search,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { ReturnVendorSaleItemsDialog } from '@/components/return-vendor-sale-items-dialog';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { openVendorSaleInvoicePopup } from '@/lib/invoicePopup';

export interface VendorSale {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  storeId?: string;
  storeName?: string;
  warehouseId?: string;
  warehouseName?: string;
  date: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  taxPercent: number;
  tax: number;
  total: number;
  paymentMethod: string;
  cashAmount: number;
  onlineAmount: number;
  creditAmount: number;
  note: string;
  returnedTotal: number;
  gatePassId?: string;
  gatePassQrUrl?: string;
}

interface VendorSaleReturnRow {
  id: string;
  number: string;
  date: string;
  items: { productId: string; name: string; quantity: number }[];
  total: number;
  note?: string;
}

const PAGE_SIZE = 20;

export function VendorSaleDetailDialog({
  sale,
  canManage = false,
  onClose,
}: {
  sale: VendorSale;
  canManage?: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [returning, setReturning] = useState(false);
  const remaining = Math.max(0, sale.total - sale.returnedTotal);

  const { data: returns = [] } = useQuery<VendorSaleReturnRow[]>({
    queryKey: ['vendor-sale-returns', sale.id],
    queryFn: async () => (await api.get(`/vendor-sales/${sale.id}/returns`)).data,
  });

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-4 w-4" /> {sale.number}
            </DialogTitle>
            <DialogDescription>
              {new Date(sale.date).toLocaleDateString()} · {sale.vendorName}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('Product')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Price')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((it) => (
                  <tr key={it.productId} className="border-b last:border-0">
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(it.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(it.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    {t('Total')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(sale.total)}
                  </td>
                </tr>
                {sale.returnedTotal > 0 && (
                  <tr className="text-muted-foreground">
                    <td className="px-3 py-2" colSpan={3}>
                      {t('Returned')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      −{formatCurrency(sale.returnedTotal)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t('Warehouse')}: </span>
              {sale.warehouseName ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">{t('Payment')}: </span>
              {sale.paymentMethod}
            </div>
          </div>

          {sale.note && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t('Note')}: </span>
              {sale.note}
            </p>
          )}

          {returns.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('Returns')}
              </p>
              {returns.map((r) => (
                <div key={r.id} className="space-y-1.5 rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.number}</span>
                    <span className="text-muted-foreground">
                      {new Date(r.date).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-muted-foreground">
                    {r.items.map((it) => (
                      <div key={it.productId} className="flex justify-between">
                        <span>{it.name}</span>
                        <span className="tabular-nums">×{it.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="font-medium">{formatCurrency(r.total)}</span>
                    {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {canManage && remaining > 0 && (
              <Button type="button" variant="outline" onClick={() => setReturning(true)}>
                <Undo2 className="h-4 w-4" /> {t('Return Items')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReturnVendorSaleItemsDialog
        sale={{ id: sale.id, number: sale.number, items: sale.items }}
        open={returning}
        onOpenChange={setReturning}
      />
    </>
  );
}

export function VendorSalesPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'vendor-sales:manage');
  const storefront = useStorefrontFilter();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<VendorSale | null>(null);
  const [returningSale, setReturningSale] = useState<VendorSale | null>(null);
  const [openGatePass, setOpenGatePass] = useState<{
    id: string;
    qrUrl?: string;
    title: string;
  } | null>(null);

  const handlePrintInvoice = async (s: VendorSale) => {
    try {
      await openVendorSaleInvoicePopup({
        number: s.number,
        date: s.date,
        storeId: s.storeId,
        storeName: s.storeName,
        vendorName: s.vendorName,
        items: s.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.lineTotal,
        })),
        subtotal: s.subtotal,
        discount: s.discount,
        tax: s.tax,
        total: s.total,
        paymentMethod: s.paymentMethod,
        returnedTotal: s.returnedTotal,
        note: s.note,
      });
    } catch {
      toast.error('Could not prepare the invoice');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-sales', search, page, storefront.store],
    queryFn: async () =>
      (
        await api.get('/vendor-sales', {
          params: { page, limit: PAGE_SIZE, search: search || undefined, ...storefront },
        })
      ).data as { vendorSales: VendorSale[]; total: number; page: number; limit: number },
  });
  const sales = data?.vendorSales ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('Search')}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('Search by number or vendor…')}
              className="w-72 pl-8"
            />
          </div>
        </div>
        {canManage && (
          <Button onClick={() => navigate('/vendor-sales/new')}>
            <HandCoins className="h-4 w-4" /> {t('New Vendor Sale')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Invoice #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Vendor')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                sales.map((s) => {
                  const remaining = Math.max(0, s.total - s.returnedTotal);
                  return (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                      onClick={() => setViewing(s)}
                    >
                      <td className="px-4 py-3 font-medium">{s.number}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(s.date).toLocaleDateString()}
                      </td>
                      <td
                        className="px-4 py-3 text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/vendors/${s.vendorId}`);
                        }}
                      >
                        {s.vendorName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(s.total)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                            <DropdownMenuItem onSelect={() => handlePrintInvoice(s)}>
                              <Printer className="h-4 w-4" /> {t('View Invoice')}
                            </DropdownMenuItem>
                            {canManage && s.returnedTotal === 0 && (
                              <DropdownMenuItem
                                onSelect={() => navigate(`/vendor-sales/${s.id}/edit`)}
                              >
                                <Pencil className="h-4 w-4" /> {t('Edit')}
                              </DropdownMenuItem>
                            )}
                            {s.gatePassId && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setOpenGatePass({
                                    id: s.gatePassId!,
                                    qrUrl: s.gatePassQrUrl,
                                    title: t('Gate Pass'),
                                  })
                                }
                              >
                                <ClipboardCheck className="h-4 w-4" /> {t('Gate Pass')}
                              </DropdownMenuItem>
                            )}
                            {canManage && remaining > 0 && (
                              <DropdownMenuItem onSelect={() => setReturningSale(s)}>
                                <Undo2 className="h-4 w-4" /> {t('Return Items')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              {!isLoading && sales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No vendor sales recorded yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border-t"
        />
      </Card>

      {viewing && (
        <VendorSaleDetailDialog
          sale={viewing}
          canManage={canManage}
          onClose={() => setViewing(null)}
        />
      )}

      <ReturnVendorSaleItemsDialog
        sale={
          returningSale
            ? { id: returningSale.id, number: returningSale.number, items: returningSale.items }
            : null
        }
        open={returningSale !== null}
        onOpenChange={(o) => !o && setReturningSale(null)}
      />

      <GatePassDialog
        gatePassId={openGatePass?.id}
        gatePassQrUrl={openGatePass?.qrUrl}
        title={openGatePass?.title}
        open={!!openGatePass}
        onOpenChange={(o) => !o && setOpenGatePass(null)}
      />
    </div>
  );
}
