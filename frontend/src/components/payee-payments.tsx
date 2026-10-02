import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

interface PayeePayment {
  id: string;
  number: string;
  paidOn: string;
  saleId?: string;
  saleNo: string;
  saleDate: string | null;
  customerName: string;
  amount: number;
  method: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  ONLINE: 'Online',
};

/**
 * A labourer's / transporter's jobs and what they were paid for each — one
 * row per Labour/Transport expense recorded against a sale invoice. Labour
 * and transport are paid only from Expenses now, so this is read-only.
 */
export function PayeePayments({ kind, id }: { kind: 'labour' | 'transporters'; id: string }) {
  const { t } = useLanguage();
  const { data: payments = [], isLoading } = useQuery<PayeePayment[]>({
    queryKey: ['payee-payments', kind, id],
    queryFn: async () => (await api.get(`/${kind}/${id}/payments`)).data,
  });
  const approved = payments.filter((p) => p.status === 'APPROVED');
  const totalPaid = approved.reduce((s, p) => s + Number(p.amount || 0), 0);
  const pending = payments.filter((p) => p.status === 'PENDING');
  const jobCount = new Set(payments.map((p) => p.saleId).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{t('Jobs')}</p>
          <p className="mt-1 text-lg font-semibold">{jobCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{t('Total paid')}</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{t('Awaiting approval')}</p>
          <p className="mt-1 text-lg font-semibold">
            {formatCurrency(pending.reduce((s, p) => s + Number(p.amount || 0), 0))}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Invoice #')}</th>
                <th className="px-4 py-3 font-medium">{t('Job date')}</th>
                <th className="px-4 py-3 font-medium">{t('Customer')}</th>
                <th className="px-4 py-3 font-medium">{t('Paid on')}</th>
                <th className="px-4 py-3 font-medium">{t('Method')}</th>
                <th className="px-4 py-3 font-medium">{t('Expense #')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.saleNo || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.saleDate ? new Date(p.saleDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">{p.customerName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.paidOn).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(METHOD_LABEL[p.method] ?? p.method)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.number}
                      {p.status === 'PENDING' && (
                        <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                          {t('Pending approval')}
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-medium tabular-nums',
                        p.status === 'PENDING' && 'text-muted-foreground',
                      )}
                    >
                      {formatCurrency(Number(p.amount))}
                    </td>
                  </tr>
                ))}
              {!isLoading && payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No jobs paid yet. Pay from Expenses → Labour / Transport.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
