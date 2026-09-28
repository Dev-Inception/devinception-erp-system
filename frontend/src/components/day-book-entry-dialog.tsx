import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

interface EntryLine {
  account: string;
  accountLabel: string;
  partyName: string;
  debit: number;
  credit: number;
}

interface EntryDocument {
  kind: 'SALE' | 'EXPENSE';
  number: string;
  // SALE
  customerName?: string;
  paymentMethod?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  transportFare?: number;
  labourRent?: number;
  total?: number;
  items?: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  // EXPENSE
  categoryName?: string;
  method?: string;
  amount?: number;
  note?: string;
}

interface DayBookEntry {
  id: string;
  date: string;
  createdAt: string;
  voucherLabel: string;
  voucherNo: string;
  description: string;
  storeName: string;
  warehouseName: string;
  createdByName: string;
  lines: EntryLine[];
  document: EntryDocument | null;
}

const stamp = (value: string) =>
  new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

/** Everything behind one Day Book row: when/by whom it was posted, each
 * debit/credit line with its party, and — for a sale or an expense — the
 * source document. `entryId` null keeps the dialog closed. */
export function DayBookEntryDialog({
  entryId,
  onClose,
}: {
  entryId: string | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { data: entry, isLoading } = useQuery<DayBookEntry>({
    queryKey: ['day-book-entry', entryId],
    queryFn: async () => (await api.get(`/reports/day-book/entries/${entryId}`)).data,
    enabled: !!entryId,
  });

  // A late-night entry moved back onto the still-open business day sits at
  // exactly 11:59:59 PM and was actually posted after that (see
  // dayEndService.businessTimestamp). Deliberately back-dated entries
  // don't match, so they don't get the note.
  const entryDate = entry ? new Date(entry.date) : null;
  const moved =
    !!entry &&
    !!entryDate &&
    entryDate.getHours() === 23 &&
    entryDate.getMinutes() === 59 &&
    entryDate.getSeconds() === 59 &&
    new Date(entry.createdAt).getTime() > entryDate.getTime();
  const doc = entry?.document;

  return (
    <Dialog open={!!entryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? `${t(entry.voucherLabel)} ${entry.voucherNo}`.trim() : t('Entry details')}
          </DialogTitle>
          {entry?.description && <DialogDescription>{entry.description}</DialogDescription>}
        </DialogHeader>

        {isLoading && <p className="py-8 text-center text-muted-foreground">{t('Loading…')}</p>}

        {entry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <Field label={t('Day Book date')} value={stamp(entry.date)} />
              {moved && <Field label={t('Actually posted at')} value={stamp(entry.createdAt)} />}
              <Field label={t('Posted by')} value={entry.createdByName} />
              <Field label={t('Store')} value={entry.storeName} />
              <Field label={t('Warehouse')} value={entry.warehouseName} />
            </div>
            {moved && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'Posted after midnight while this business day was still open, so it is recorded on this day at 11:59 PM.',
                )}
              </p>
            )}

            {doc?.kind === 'SALE' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label={t('Customer')} value={doc.customerName} />
                  <Field label={t('Payment')} value={doc.paymentMethod} />
                </div>
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
                      {(doc.items ?? []).map((it, i) => (
                        <tr key={i} className="border-b last:border-0">
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
                  </table>
                </div>
                <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                  {(
                    [
                      ['Subtotal', doc.subtotal],
                      ['Discount', doc.discount ? -doc.discount : 0],
                      ['Tax', doc.tax],
                      ['Transport', doc.transportFare],
                      ['Labour', doc.labourRent],
                    ] as const
                  )
                    .filter(([, v]) => !!v)
                    .map(([label, v]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-muted-foreground">{t(label)}</span>
                        <span className="tabular-nums">{formatCurrency(v ?? 0)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>{t('Total')}</span>
                    <span className="tabular-nums">{formatCurrency(doc.total ?? 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {doc?.kind === 'EXPENSE' && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
                <Field label={t('Expense #')} value={doc.number} />
                <Field label={t('Category')} value={doc.categoryName} />
                <Field label={t('Paid by')} value={doc.method} />
                <Field label={t('Amount')} value={formatCurrency(doc.amount ?? 0)} />
                <Field label={t('Note')} value={doc.note} />
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {t('Accounting entries')}
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Account')}</th>
                      <th className="px-3 py-2 font-medium">{t('Party')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Debit')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">{t(l.accountLabel)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.partyName || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {l.debit ? formatCurrency(l.debit) : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {l.credit ? formatCurrency(l.credit) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
