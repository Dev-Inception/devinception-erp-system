import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type Kind = 'customers' | 'vendors';
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

export function LedgersPage() {
  const [kind, setKind] = useState<Kind>('customers');
  const [selected, setSelected] = useState<Party | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: [kind],
    queryFn: async () => (await api.get(`/${kind}`)).data,
  });

  const { data: ledger } = useQuery<{ balance: number; opening: number; entries: LedgerRow[] }>({
    queryKey: ['ledger', kind, selected?.id, from, to],
    queryFn: async () =>
      (
        await api.get(`/${kind}/${selected!.id}/ledger`, {
          params: { from: from || undefined, to: to || undefined },
        })
      ).data,
    enabled: !!selected,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(['customers', 'vendors'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setSelected(null);
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition',
                  kind === k ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {parties.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition',
                selected?.id === p.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
              )}
            >
              <span className="truncate">{p.name}</span>
              <span className="text-xs">{formatCurrency(p.outstanding)}</span>
            </button>
          ))}
          {parties.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No {kind} yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{selected ? `${selected.name} — Statement` : 'Select an account'}</CardTitle>
            {selected && (
              <p className="text-sm text-muted-foreground">
                {from && (
                  <>
                    Opening balance:{' '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(ledger?.opening ?? 0)}
                    </span>
                    {' · '}
                  </>
                )}
                {from || to ? 'Closing balance' : 'Current balance'}:{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(ledger?.balance ?? 0)}
                </span>
              </p>
            )}
          </div>
          {selected && (
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!selected ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              Pick a {kind === 'customers' ? 'customer' : 'vendor'} to view their ledger.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Debit</th>
                  <th className="px-4 py-2 text-right font-medium">Credit</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
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
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
