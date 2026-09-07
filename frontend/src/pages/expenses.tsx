import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
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
  DialogClose,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useBankAccounts } from '@/lib/bankAccounts';
import { useLanguage } from '@/components/language-provider';

type ExpenseMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'ONLINE';
type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
}

interface Expense {
  id: string;
  number: string;
  categoryId: string;
  categoryName: string;
  amount: number | string;
  method: ExpenseMethod;
  bankAccountId?: string;
  storeId?: string;
  storeName?: string;
  date: string;
  note: string;
  status: ExpenseStatus;
  rejectionReason: string;
}

const PAGE_SIZE = 20;
const SEARCH_FETCH_LIMIT = 200;

const METHOD_LABEL: Record<ExpenseMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  ONLINE: 'Online',
};
const BANK_METHODS = new Set<ExpenseMethod>(['CARD', 'BANK_TRANSFER', 'ONLINE']);

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
const STATUS_STYLE: Record<ExpenseStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-600',
  APPROVED: 'bg-emerald-500/10 text-emerald-600',
  REJECTED: 'bg-destructive/10 text-destructive',
};

// Common day-to-day spend a small business runs into — shown as one-tap
// suggestions so a first-time user isn't staring at an empty category list.
const SUGGESTED_CATEGORIES = [
  'Food & Refreshments',
  'Electricity Bill',
  'Water Bill',
  'Internet & Phone',
  'Fuel & Transport',
  'Office Repair & Maintenance',
  'Stationery & Supplies',
  'Cleaning',
  'Rent',
  'Miscellaneous',
];

/* ── Record / edit an expense — category (pick or type a new one), amount,
   how it was paid, and an optional note. ── */
function ExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!expense;
  const authUser = useAuthStore((s) => s.user);
  const isSuperAdmin = authUser?.role === 'SUPER_ADMIN';
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: async () => (await api.get('/expenses/categories')).data,
    enabled: open,
  });
  // A bank-paid expense settles into one of *this expense's* store's
  // accounts — the currently-edited store when editing, else the header's.
  const { data: banks = [] } = useBankAccounts(
    expense?.storeId ?? (hasSpecificStore ? currentStoreId : undefined),
    open,
  );
  const activeBanks = banks.filter((b) => b.isActive);

  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [amount, setAmount] = useState(Number(expense?.amount ?? 0));
  const [method, setMethod] = useState<ExpenseMethod>(expense?.method ?? 'CASH');
  const [bankAccountId, setBankAccountId] = useState(expense?.bankAccountId ?? '');
  const [date, setDate] = useState(
    expense ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState(expense?.note ?? '');

  const addCategory = useMutation({
    mutationFn: async (name: string) => (await api.post('/expenses/categories', { name })).data,
    onSuccess: (category: ExpenseCategory) => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      setCategoryId(category.id);
      setAddingCategory(false);
      setNewCategory('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not add category'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId,
        amount,
        method,
        bankAccountId: BANK_METHODS.has(method) ? bankAccountId : undefined,
        storeId: hasSpecificStore ? currentStoreId : undefined,
        date,
        note,
      };
      return editing
        ? (await api.patch(`/expenses/${expense!.id}`, payload)).data
        : (await api.post('/expenses', payload)).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Expense updated' : 'Expense recorded');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const canSubmit =
    !!categoryId &&
    amount > 0 &&
    (!BANK_METHODS.has(method) || !!bankAccountId) &&
    (editing || hasSpecificStore) &&
    !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Expense' : 'Record Expense'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Editing ${expense!.number}`
              : 'Day-to-day spend — food, bills, repairs, and anything else that isn’t a purchase or a sale.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          {!editing && !hasSpecificStore && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t('Select a specific store from the header before recording an expense.')}
            </p>
          )}
          {!editing && !isSuperAdmin && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              {t('This will be sent to the super admin for approval before it affects the books.')}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t('Category')}</Label>
            {addingCategory ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder={t('New category name…')}
                />
                <Button
                  type="button"
                  disabled={!newCategory.trim() || addCategory.isPending}
                  onClick={() => addCategory.mutate(newCategory.trim())}
                >
                  {addCategory.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('Add')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setAddingCategory(false)}>
                  {t('Cancel')}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="" disabled>
                    {t('Select category…')}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={() => setAddingCategory(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            {!addingCategory && categories.length === 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTED_CATEGORIES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addCategory.mutate(name)}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {t(name)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('Amount (Rs)')}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                required
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Paid via')}</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(METHOD_LABEL) as ExpenseMethod[]).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={method === m ? 'default' : 'outline'}
                  onClick={() => setMethod(m)}
                >
                  {t(METHOD_LABEL[m])}
                </Button>
              ))}
            </div>
          </div>

          {BANK_METHODS.has(method) && (
            <div className="space-y-1.5">
              <Label>{t('Bank / account')}</Label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="" disabled>
                  {t('Select account…')}
                </option>
                {activeBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.bankName ? ` (${b.bankName})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('Note (optional)')}</Label>
            <textarea
              className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('e.g. Lunch for staff, office chair repair, electricity bill…')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? t('Save Changes') : t('Record Expense')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Super admin rejects a pending expense — a reason keeps the requester
   from wondering what happened. ── */
function RejectDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [reason, setReason] = useState('');

  const reject = useMutation({
    mutationFn: async () => (await api.post(`/expenses/${expense.id}/reject`, { reason })).data,
    onSuccess: () => {
      toast.success('Expense rejected');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not reject expense'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Reject Expense')}</DialogTitle>
          <DialogDescription>
            {expense.number} — {expense.categoryName} — {formatCurrency(Number(expense.amount))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t('Reason (optional)')}</Label>
          <textarea
            className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            maxLength={500}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('Why this expense is being rejected…')}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reject.isPending}
            onClick={() => reject.mutate()}
          >
            {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Reject')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'expenses:manage');
  const isSuperAdmin = authUser?.role === 'SUPER_ADMIN';
  const storefront = useStorefrontFilter();

  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExpenseStatus>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [rejectingExpense, setRejectingExpense] = useState<Expense | null>(null);

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: async () => (await api.get('/expenses/categories')).data,
  });

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;
  const fetchPage = isSearching ? 1 : page;

  const { data, isLoading } = useQuery({
    queryKey: [
      'expenses',
      categoryFilter,
      statusFilter,
      from,
      to,
      search,
      fetchPage,
      fetchLimit,
      storefront.store,
    ],
    queryFn: async () =>
      (
        await api.get('/expenses', {
          params: {
            category: categoryFilter || undefined,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            from: from || undefined,
            to: to || undefined,
            search: search || undefined,
            page: fetchPage,
            limit: fetchLimit,
            ...storefront,
          },
        })
      ).data as { expenses: Expense[]; total: number; totalAmount: number },
  });
  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;
  const totalAmount = data?.totalAmount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => {
      toast.success('Expense deleted');
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete expense'),
  });
  const remove = (e: Expense) => {
    if (window.confirm(`Delete expense ${e.number}? This cannot be undone.`)) del.mutate(e.id);
  };

  const approve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/expenses/${id}/approve`)).data,
    onSuccess: () => {
      toast.success('Expense approved');
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not approve expense'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {isSearching ? expenses.length : total} expense(s)
          </p>
          <p className="flex items-center gap-1.5 text-lg font-semibold">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            {formatCurrency(Number(totalAmount))}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={statusFilter === value ? 'default' : 'outline'}
                onClick={() => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                {value === 'ALL' ? t('All') : t(STATUS_LABEL[value])}
              </Button>
            ))}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{t('All categories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="w-36"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="w-36"
          />
          <div className="w-56 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('Search #, category or note…')}
                className="pl-8"
              />
            </div>
          </div>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('Record Expense')}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Expense #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Category')}</th>
                <th className="px-4 py-3 font-medium">{t('Note')}</th>
                <th className="px-4 py-3 font-medium">{t('Paid via')}</th>
                <th className="px-4 py-3 font-medium">{t('Status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                expenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(e.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                        {e.categoryName}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                      {e.note || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t(METHOD_LABEL[e.method])}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          STATUS_STYLE[e.status],
                        )}
                        title={e.status === 'REJECTED' ? e.rejectionReason : undefined}
                      >
                        {t(STATUS_LABEL[e.status])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(e.amount))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {isSuperAdmin && e.status !== 'APPROVED' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-600"
                            title={t(
                              e.status === 'REJECTED' ? 'Approve (reverse rejection)' : 'Approve',
                            )}
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(e.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {isSuperAdmin && e.status !== 'REJECTED' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title={t(
                              e.status === 'APPROVED' ? 'Reject (reverse approval)' : 'Reject',
                            )}
                            onClick={() => setRejectingExpense(e)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && e.status !== 'REJECTED' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Edit')}
                            onClick={() => setEditingExpense(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Delete')}
                            disabled={del.isPending}
                            onClick={() => remove(e)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && expenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No expenses yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      {creating && <ExpenseDialog expense={null} open={creating} onOpenChange={setCreating} />}
      {editingExpense && (
        <ExpenseDialog
          expense={editingExpense}
          open={editingExpense !== null}
          onOpenChange={(o) => !o && setEditingExpense(null)}
        />
      )}
      {rejectingExpense && (
        <RejectDialog expense={rejectingExpense} onClose={() => setRejectingExpense(null)} />
      )}
    </div>
  );
}
