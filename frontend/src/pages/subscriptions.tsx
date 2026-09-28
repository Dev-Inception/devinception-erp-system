import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, CreditCard, Search, Store as StoreIcon } from 'lucide-react';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface Owner {
  id: string;
  name: string;
  email: string;
  storeIds: string[];
}

interface Subscription {
  id: string;
  storeId: string;
  storeName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly' | 'one_time';
  status: 'active' | 'inactive' | 'expired' | 'cancelled';
  startsAt: string;
  endsAt: string | null;
  notes: string;
}

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-time' },
];
const STATUSES = ['active', 'inactive', 'expired', 'cancelled'] as const;

const STATUS_TINT: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600',
  inactive: 'bg-slate-500/10 text-slate-500',
  expired: 'bg-amber-500/10 text-amber-600',
  cancelled: 'bg-rose-500/10 text-rose-600',
};

/** Provision a customer's store(s) — creates (or reuses) the owner's ADMIN
 * account, N new stores, and a subscription per store, all in one call. */
function ProvisionDialog() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [ownerMode, setOwnerMode] = useState<'new' | 'existing'>('new');
  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    storeCount: 1,
    amountPerStore: '',
    billingCycle: 'monthly' as Subscription['billingCycle'],
    notes: '',
  });

  const { data: owners = [] } = useQuery<Owner[]>({
    queryKey: ['subscription-owners'],
    queryFn: async () => (await api.get('/subscriptions/owners')).data,
    enabled: open && ownerMode === 'existing',
  });

  useEffect(() => {
    if (open) {
      setOwnerMode('new');
      setForm({
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
        storeCount: 1,
        amountPerStore: '',
        billingCycle: 'monthly',
        notes: '',
      });
    }
  }, [open]);

  const selectExistingOwner = (id: string) => {
    const owner = owners.find((o) => o.id === id);
    if (owner) setForm((f) => ({ ...f, ownerName: owner.name, ownerEmail: owner.email }));
  };

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post('/subscriptions/provision', {
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPassword: ownerMode === 'new' ? form.ownerPassword : undefined,
          storeCount: Number(form.storeCount),
          amountPerStore: Number(form.amountPerStore),
          billingCycle: form.billingCycle,
          notes: form.notes || undefined,
        })
      ).data,
    onSuccess: (data) => {
      toast.success(`${data.stores.length} store(s) provisioned for ${data.owner.name}`);
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not provision store(s)'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t('Sell Store(s)')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sell Store(s)</DialogTitle>
          <DialogDescription>
            Provision one or more stores for a customer — they become that store's admin and can
            manage it independently from here on.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex gap-2 rounded-md border p-1 text-sm">
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 ${ownerMode === 'new' ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={() => setOwnerMode('new')}
            >
              New customer
            </button>
            <button
              type="button"
              className={`flex-1 rounded px-2 py-1 ${ownerMode === 'existing' ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={() => setOwnerMode('existing')}
            >
              Existing customer
            </button>
          </div>

          {ownerMode === 'existing' && (
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <select
                required
                value={owners.find((o) => o.email === form.ownerEmail)?.id ?? ''}
                onChange={(e) => selectExistingOwner(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select customer…</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.email}) — {o.storeIds.length} store(s)
                  </option>
                ))}
              </select>
            </div>
          )}

          {ownerMode === 'new' && (
            <>
              <div className="space-y-1.5">
                <Label>Customer name *</Label>
                <Input
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Customer email *</Label>
                <Input
                  required
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Initial password *</Label>
                <Input
                  required
                  minLength={8}
                  type="text"
                  value={form.ownerPassword}
                  onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                  placeholder="Shared with the customer to log in"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Number of stores *</Label>
              <Input
                required
                type="number"
                min={1}
                max={50}
                value={form.storeCount}
                onChange={(e) => setForm({ ...form, storeCount: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount / store *</Label>
              <Input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.amountPerStore}
                onChange={(e) => setForm({ ...form, amountPerStore: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Billing cycle *</Label>
            <select
              value={form.billingCycle}
              onChange={(e) => setForm({ ...form, billingCycle: e.target.value as any })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {BILLING_CYCLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edit an existing subscription's amount/cycle/status/notes. */
function EditSubscriptionDialog({
  subscription,
  open,
  onOpenChange,
}: {
  subscription: Subscription;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    amount: String(subscription.amount),
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    notes: subscription.notes,
  });

  useEffect(() => {
    if (open) {
      setForm({
        amount: String(subscription.amount),
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        notes: subscription.notes,
      });
    }
  }, [open, subscription]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/subscriptions/${subscription.id}`, {
          amount: Number(form.amount),
          billingCycle: form.billingCycle,
          status: form.status,
          notes: form.notes || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Subscription updated');
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update subscription'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Subscription</DialogTitle>
          <DialogDescription>
            {subscription.storeName} — {subscription.ownerName}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing cycle *</Label>
              <select
                value={form.billingCycle}
                onChange={(e) => setForm({ ...form, billingCycle: e.target.value as any })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {BILLING_CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerGroup {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  subscriptions: Subscription[];
}

function groupByCustomer(subscriptions: Subscription[]): CustomerGroup[] {
  const groups = new Map<string, CustomerGroup>();
  for (const s of subscriptions) {
    const existing = groups.get(s.ownerId);
    if (existing) {
      existing.subscriptions.push(s);
    } else {
      groups.set(s.ownerId, {
        ownerId: s.ownerId,
        ownerName: s.ownerName,
        ownerEmail: s.ownerEmail,
        subscriptions: [s],
      });
    }
  }
  return Array.from(groups.values());
}

/** One customer's stores — each still edited individually, since a
 * subscription (amount/cycle/status) belongs to exactly one store. */
function CustomerDetailDialog({
  group,
  open,
  onOpenChange,
}: {
  group: CustomerGroup;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<Subscription | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group.ownerName}</DialogTitle>
          <DialogDescription>
            {group.ownerEmail} — {group.subscriptions.length} store(s)
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Store</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Cycle</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.subscriptions.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">{s.storeName}</td>
                  <td className="px-4 py-2">{s.amount.toLocaleString()}</td>
                  <td className="px-4 py-2 capitalize">{s.billingCycle.replace('_', ' ')}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TINT[s.status]}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title={t('Edit')}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end pt-1">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('Close')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
      {editing && (
        <EditSubscriptionDialog
          key={editing.id}
          subscription={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </Dialog>
  );
}

export function SubscriptionsPage() {
  const { t } = useLanguage();
  const role = useAuthStore((s) => s.user?.role);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<{ subscriptions: Subscription[]; total: number }>({
    queryKey: ['subscriptions', search],
    queryFn: async () => (await api.get('/subscriptions', { params: { search } })).data,
  });
  // One "Sell Store(s)" sale creates one subscription row per store, but a
  // customer should read as a single listing here — the per-store breakdown
  // lives in CustomerDetailDialog instead.
  const groups = useMemo(() => groupByCustomer(data?.subscriptions ?? []), [data]);
  const [viewing, setViewing] = useState<CustomerGroup | null>(null);

  if (role !== 'SUPER_ADMIN') {
    return <p className="text-sm text-muted-foreground">You don't have access to this page.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by customer name or email…"
                className="w-72 pl-8"
              />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">{groups.length} customer(s)</p>
        </div>
        <ProvisionDialog />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Store(s)</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Cycle</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                groups.map((g) => {
                  const totalAmount = g.subscriptions.reduce((sum, s) => sum + s.amount, 0);
                  const cycles = new Set(g.subscriptions.map((s) => s.billingCycle));
                  const statuses = new Set(g.subscriptions.map((s) => s.status));
                  return (
                    <tr
                      key={g.ownerId}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                      onClick={() => setViewing(g)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          {g.ownerName}
                        </div>
                        <p className="text-xs text-muted-foreground">{g.ownerEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {g.subscriptions.length === 1
                            ? g.subscriptions[0].storeName
                            : `${g.subscriptions.length} stores`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {totalAmount.toLocaleString()}
                        {g.subscriptions.length > 1 && (
                          <p className="text-xs text-muted-foreground">
                            {g.subscriptions.length} store(s)
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {cycles.size === 1 ? [...cycles][0].replace('_', ' ') : 'Mixed'}
                      </td>
                      <td className="px-4 py-3">
                        {statuses.size === 1 ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TINT[[...statuses][0]]}`}
                          >
                            {[...statuses][0]}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            Mixed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewing(g);
                          }}
                        >
                          {t('View')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No subscriptions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && (
        <CustomerDetailDialog
          key={viewing.ownerId}
          group={viewing}
          open={!!viewing}
          onOpenChange={(v) => !v && setViewing(null)}
        />
      )}
    </div>
  );
}
