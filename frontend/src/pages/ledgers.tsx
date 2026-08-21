import { useMemo, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, Container, Factory, HardHat, Search, Truck, Users } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

type Kind = 'customers' | 'vendors' | 'suppliers' | 'labour' | 'transporters';
const KIND_ORDER: Kind[] = ['customers', 'vendors', 'suppliers', 'labour', 'transporters'];
const SINGULAR: Record<Kind, string> = {
  customers: 'customer',
  vendors: 'vendor',
  suppliers: 'supplier',
  labour: 'labourer',
  transporters: 'transporter',
};
const KIND_LABEL: Record<Kind, string> = {
  customers: 'Customers',
  vendors: 'Vendors',
  suppliers: 'Suppliers',
  labour: 'Labour',
  transporters: 'Transporters',
};
const KIND_ICON: Record<Kind, ComponentType<{ className?: string }>> = {
  customers: Users,
  vendors: Truck,
  suppliers: Factory,
  labour: HardHat,
  transporters: Container,
};
// Customers carry a receivable (money owed to us); every other kind is a
// payable (money we owe them) — colors the balance badge accordingly.
const RECEIVABLE_KIND: Kind = 'customers';

interface Party {
  id: string;
  name: string;
  outstanding: number;
}
interface LedgerRow {
  date: string;
  description?: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

type DatePreset = 'today' | 'month' | 'all';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function LedgersPage() {
  const { t } = useLanguage();
  const [kind, setKind] = useState<Kind>('customers');
  const [selected, setSelected] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<DatePreset>('all');
  const storefront = useStorefrontFilter();

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: [kind, storefront.store],
    queryFn: async () => (await api.get(`/${kind}`, { params: storefront })).data,
  });

  const { data: ledger } = useQuery<{ balance: number; opening: number; entries: LedgerRow[] }>({
    queryKey: ['ledger', kind, selected?.id, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get(`/${kind}/${selected!.id}/ledger`, {
          params: { from: from || undefined, to: to || undefined, ...storefront },
        })
      ).data,
    enabled: !!selected,
  });

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    const sorted = [...parties].sort((a, b) => b.outstanding - a.outstanding);
    return q ? sorted.filter((p) => p.name.toLowerCase().includes(q)) : sorted;
  }, [parties, partySearch]);

  const totalOutstanding = useMemo(
    () => parties.reduce((sum, p) => sum + Math.max(0, p.outstanding), 0),
    [parties],
  );

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    if (p === 'today') {
      const today = isoDate(new Date());
      setFrom(today);
      setTo(today);
    } else if (p === 'month') {
      const now = new Date();
      setFrom(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(isoDate(now));
    } else {
      setFrom('');
      setTo('');
    }
  };

  const isReceivable = kind === RECEIVABLE_KIND;

  return (
    <div className="space-y-4">
      {/* Kind switcher — scrollable pill row so 5 kinds never cramp on small screens */}
      <div className="flex gap-1.5 overflow-x-auto rounded-lg bg-muted p-1.5">
        {KIND_ORDER.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setSelected(null);
                setPartySearch('');
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                kind === k
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(KIND_LABEL[k])}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="flex h-fit flex-col">
          <CardHeader className="gap-3 pb-3">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-sm text-muted-foreground">{t(KIND_LABEL[kind])}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {parties.length} {parties.length === 1 ? t('account') : t('accounts')}
              </span>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-xs uppercase text-muted-foreground">
                {isReceivable ? t('Total receivable') : t('Total payable')}
              </p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  totalOutstanding > 0 && (isReceivable ? 'text-success' : 'text-destructive'),
                )}
              >
                {formatCurrency(totalOutstanding)}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                placeholder={t('Search') + '…'}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[55vh] space-y-1 overflow-y-auto p-2 pt-0">
            {filteredParties.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                  selected?.id === p.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                )}
              >
                <span className="truncate">{p.name}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                    p.outstanding > 0
                      ? isReceivable
                        ? 'bg-success/10 text-success'
                        : 'bg-destructive/10 text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {formatCurrency(p.outstanding)}
                </span>
              </button>
            ))}
            {filteredParties.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                {partySearch ? t('No matches found.') : t('No accounts yet.')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{selected ? selected.name : t('Select an account')}</CardTitle>
                {selected && (
                  <p className="text-sm text-muted-foreground">{t('Account statement')}</p>
                )}
              </div>
              {selected && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('From')}</Label>
                    <Input
                      type="date"
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        setPreset('all');
                      }}
                      className="h-8 w-36 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('To')}</Label>
                    <Input
                      type="date"
                      value={to}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setPreset('all');
                      }}
                      className="h-8 w-36 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-md bg-muted p-1">
                  {(
                    [
                      ['today', 'Today'],
                      ['month', 'This Month'],
                      ['all', 'All Time'],
                    ] as [DatePreset, string][]
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      onClick={() => applyPreset(p)}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition',
                        preset === p
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {from && (
                    <div className="rounded-md border bg-muted/20 px-3 py-1.5 text-sm">
                      <span className="text-xs text-muted-foreground">{t('Opening')}: </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(ledger?.opening ?? 0)}
                      </span>
                    </div>
                  )}
                  <div className="rounded-md border bg-primary/5 px-3 py-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {from || to ? t('Closing') : t('Current balance')}:{' '}
                    </span>
                    <span className="font-semibold tabular-nums text-primary">
                      {formatCurrency(ledger?.balance ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {!selected ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted-foreground">
                <BookOpenCheck className="h-8 w-8 opacity-40" />
                <p className="text-sm">Pick a {SINGULAR[kind]} to view their ledger.</p>
              </div>
            ) : (
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
                        <td className="px-4 py-2 text-right tabular-nums">
                          {e.debit ? formatCurrency(e.debit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {e.credit ? formatCurrency(e.credit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
