import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';
import type { Sale } from '@/pages/sales';
import { PAYMENT_LABEL } from '@/pages/sales';

interface SaleReturnRow {
  id: string;
  number: string;
  date: string;
  items: { productId: string; name: string; quantity: number }[];
  total: number;
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasis ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  );
}

/**
 * In-app read-only view of a sale's invoice, reached from the Sales table's
 * "View Invoice" action. Printing still goes through the existing popup
 * template (onPrint), so this sheet only needs to summarize the same data.
 */
export function SaleInvoiceSheet({
  sale,
  open,
  onOpenChange,
  onPrint,
}: {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (sale: Sale) => void;
}) {
  const { t } = useLanguage();
  const hasReturns = Number(sale?.returnedTotal) > 0;

  const { data: returns = [], isLoading: returnsLoading } = useQuery<SaleReturnRow[]>({
    queryKey: ['sale-returns', sale?.id],
    queryFn: async () => (await api.get(`/sales/${sale!.id}/returns`)).data,
    enabled: open && hasReturns && Boolean(sale?.id),
  });

  if (!sale) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sale.saleNumber}</SheetTitle>
          <SheetDescription>{new Date(sale.date).toLocaleString()}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('Customer')}
              </p>
              <p className="font-medium">{sale.customer?.name ?? 'Walk-in'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('Store')}</p>
              <p className="font-medium">{sale.storeName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('Payment')}
              </p>
              <p className="font-medium">
                {PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('Status')}</p>
              <p className="font-medium">{sale.status}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('Items')}
            </p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('Item')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((it, idx) => (
                    <tr key={`${it.productId}-${idx}`} className="border-b last:border-0">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        ×{it.quantity}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(Number(it.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {hasReturns && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('Returns')}
              </p>
              {returnsLoading && <p className="text-sm text-muted-foreground">{t('Loading…')}</p>}
              <div className="space-y-2">
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
                    <div className="flex justify-end border-t pt-1.5 font-medium">
                      {formatCurrency(r.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5 rounded-lg border p-3">
            <Row label={t('Subtotal')} value={formatCurrency(Number(sale.subtotal))} />
            {Number(sale.discountTotal) > 0 && (
              <Row
                label={t('Discount')}
                value={`- ${formatCurrency(Number(sale.discountTotal))}`}
              />
            )}
            {Number(sale.taxTotal) > 0 && (
              <Row label={t('Tax')} value={formatCurrency(Number(sale.taxTotal))} />
            )}
            {Number(sale.transportFare) > 0 && (
              <Row label={t('Transport Fare')} value={formatCurrency(Number(sale.transportFare))} />
            )}
            {Number(sale.labourRentTotal) > 0 && (
              <Row label={t('Labour Fare')} value={formatCurrency(Number(sale.labourRentTotal))} />
            )}
            {hasReturns && (
              <Row
                label={t('Returned')}
                value={`- ${formatCurrency(Number(sale.returnedTotal))}`}
              />
            )}
            <div className="border-t pt-1.5">
              <Row label={t('Total')} value={formatCurrency(Number(sale.grandTotal))} emphasis />
            </div>
            {Number(sale.paidAmount) > 0 && (
              <Row label={t('Advance Paid')} value={formatCurrency(Number(sale.paidAmount))} />
            )}
            <Row
              label={t('Balance Due')}
              value={formatCurrency(Number(sale.balanceDue))}
              emphasis
            />
          </div>
        </div>

        <Button className="w-full" variant="outline" onClick={() => onPrint(sale)}>
          <Printer className="h-4 w-4" /> {t('Print Invoice')}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
