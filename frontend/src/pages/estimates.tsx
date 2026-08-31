import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserX,
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
  DialogClose,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

type EstimateStatus = 'PENDING' | 'FOLLOWED_UP' | 'CONVERTED' | 'LOST';

interface EstimateItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number | string;
  amount: number | string;
}

interface FollowUp {
  date: string;
  note: string;
  byName?: string;
}

interface Estimate {
  id: string;
  number: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  storeId?: string;
  storeName?: string;
  date: string;
  items: EstimateItem[];
  subtotal: number | string;
  discountTotal: number | string;
  taxPercent: number | string;
  taxTotal: number | string;
  grandTotal: number | string;
  notes: string;
  status: EstimateStatus;
  followUps: FollowUp[];
  nextFollowUpDate?: string;
  lostReason: string;
  convertedSaleId?: string;
  convertedAt?: string;
}

interface CustomerLite {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
}

interface CartLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

const PAGE_SIZE = 20;
const SEARCH_FETCH_LIMIT = 200;

const STATUS_LABEL: Record<EstimateStatus, string> = {
  PENDING: 'Pending',
  FOLLOWED_UP: 'Followed Up',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};
const STATUS_STYLE: Record<EstimateStatus, string> = {
  PENDING: 'bg-blue-500/10 text-blue-600',
  FOLLOWED_UP: 'bg-amber-500/10 text-amber-600',
  CONVERTED: 'bg-emerald-500/10 text-emerald-600',
  LOST: 'bg-muted text-muted-foreground',
};

/* ── Create / edit an estimate — customer lookup-or-capture, a real product
   search to build the quote, discount/tax, and notes. ── */
function EstimateDialog({
  estimate,
  open,
  onOpenChange,
}: {
  estimate: Estimate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!estimate;
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCustomerId(estimate?.customerId);
    setCustomerName(estimate?.customerName ?? '');
    setCustomerPhone(estimate?.customerPhone ?? '');
    setCustomerAddress(estimate?.customerAddress ?? '');
    setCustomerSearch('');
    setLines(
      estimate?.items.map((it, idx) => ({
        key: `${it.productId}-${idx}`,
        productId: it.productId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
      })) ?? [],
    );
    setDiscount(Number(estimate?.discountTotal ?? 0));
    setTaxPercent(Number(estimate?.taxPercent ?? 0));
    setNotes(estimate?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estimate?.id]);

  const customerSearchTerm = customerSearch.trim();
  const { data: customerMatches = [] } = useQuery<CustomerLite[]>({
    queryKey: ['estimate-customer-search', customerSearchTerm],
    queryFn: async () =>
      (await api.get('/customers', { params: { search: customerSearchTerm } })).data,
    enabled: open && customerPickerOpen,
  });
  const { data: products = [] } = useQuery<ProductLite[]>({
    queryKey: ['estimate-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
    enabled: open,
  });

  const pickCustomer = (c: CustomerLite) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? '');
    setCustomerAddress(c.address ?? '');
    setCustomerSearch('');
    setCustomerPickerOpen(false);
  };
  const clearCustomer = () => {
    setCustomerId(undefined);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
  };

  const addLine = (p: ProductLite) => {
    setProductSearch('');
    setProductPickerOpen(false);
    productSearchRef.current?.blur();
    setLines((ls) => {
      if (ls.some((l) => l.productId === p.id)) {
        return ls.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...ls,
        { key: p.id, productId: p.id, name: p.name, quantity: 1, unitPrice: Number(p.salePrice) },
      ];
    });
  };
  const setLineQty = (key: string, quantity: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity } : l)));
  const setLinePrice = (key: string, unitPrice: number) =>
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, unitPrice: Math.max(0, unitPrice) } : l)),
    );
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, discount));
  const net = subtotal - discountAmount;
  const taxAmount = (net * Math.max(0, taxPercent)) / 100;
  const total = net + taxAmount;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId,
        customerName,
        customerPhone,
        customerAddress,
        storeId: hasSpecificStore ? currentStoreId : undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        discountTotal: discountAmount,
        taxPercent: Math.max(0, taxPercent),
        notes,
      };
      return editing
        ? (await api.patch(`/estimates/${estimate!.id}`, payload)).data
        : (await api.post('/estimates', payload)).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Estimate updated' : 'Estimate created');
      qc.invalidateQueries({ queryKey: ['estimates'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const canSubmit =
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0) &&
    customerName.trim().length > 0 &&
    !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Estimate' : 'New Estimate'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Editing ${estimate!.number}`
              : "Quote products for a customer — nothing is reserved or added to stock until it's converted to a sale."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('Customer')}</Label>
            {customerId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{customerName}</p>
                  {customerPhone && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {customerPhone}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={clearCustomer}
                >
                  <UserX className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onFocus={() => setCustomerPickerOpen(true)}
                    onBlur={() => setTimeout(() => setCustomerPickerOpen(false), 150)}
                    placeholder={t('Search an existing customer…')}
                    className="pl-8"
                  />
                  {customerPickerOpen && customerSearchTerm && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                      {customerMatches.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">{t('No matches')}</p>
                      ) : (
                        customerMatches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCustomer(c)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span>{c.name}</span>
                            <span className="text-xs text-muted-foreground">{c.phone}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    required
                    placeholder={t('Name *')}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <Input
                    placeholder={t('Phone')}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                  <Input
                    placeholder={t('Address')}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('Items')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productSearchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setProductPickerOpen(true)}
                onBlur={() => setTimeout(() => setProductPickerOpen(false), 150)}
                placeholder={t('Search products to add…')}
                className="pl-8"
              />
              {productPickerOpen && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      {t('No products found')}
                    </p>
                  ) : (
                    products.map((p) => {
                      const inCart = lines.some((l) => l.productId === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addLine(p)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {formatCurrency(Number(p.salePrice))}
                            {inCart && <Check className="h-4 w-4 text-primary" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {lines.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Price')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.key} className="border-b last:border-0">
                        <td className="px-3 py-2">{l.name}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-20 text-right"
                            value={l.quantity || ''}
                            onChange={(e) => setLineQty(l.key, Number(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 w-24 text-right"
                            value={l.unitPrice || ''}
                            onChange={(e) => setLinePrice(l.key, Number(e.target.value))}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeLine(l.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                {t('No items yet — search above to add products.')}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('Discount (Rs)')}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Tax %')}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={taxPercent || ''}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Notes (optional)')}</Label>
            <textarea
              className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('What the customer is looking for, special requests, etc.')}
            />
          </div>

          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{t('Subtotal')}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t('Discount')}</span>
                <span>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t('Tax')}</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>{t('Total')}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? t('Save Changes') : t('Create Estimate')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Log a follow-up call/visit, schedule the next one, or give up on the
   lead — the history stays visible so nothing gets chased twice. ── */
function FollowUpDialog({ estimate, onClose }: { estimate: Estimate; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['estimates'] });

  const logFollowUp = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/estimates/${estimate.id}/follow-up`, {
          note,
          nextFollowUpDate: nextDate || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Follow-up logged');
      invalidate();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not log follow-up'),
  });

  const markLost = useMutation({
    mutationFn: async () =>
      (await api.post(`/estimates/${estimate.id}/lost`, { reason: note })).data,
    onSuccess: () => {
      toast.success('Estimate marked lost');
      invalidate();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update estimate'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Follow Up')}</DialogTitle>
          <DialogDescription>
            {estimate.number} — {estimate.customerName}
          </DialogDescription>
        </DialogHeader>

        {estimate.followUps.length > 0 && (
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
            {estimate.followUps
              .slice()
              .reverse()
              .map((f, idx) => (
                <div key={idx} className="text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(f.date).toLocaleString()}</span>
                    {f.byName && <span>{f.byName}</span>}
                  </div>
                  <p>{f.note}</p>
                </div>
              ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('Note')}</Label>
            <textarea
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              maxLength={500}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('What happened on this follow-up…')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('Next follow-up date (optional)')}</Label>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={markLost.isPending || !note.trim()}
            onClick={() => markLost.mutate()}
          >
            {markLost.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Mark as Lost')}
          </Button>
          <Button
            type="button"
            disabled={logFollowUp.isPending || !note.trim()}
            onClick={() => logFollowUp.mutate()}
          >
            {logFollowUp.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Log Follow-up')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EstimatesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canCreate = grantsPermission(authUser?.permissions, 'estimates:create');
  const canManage = grantsPermission(authUser?.permissions, 'estimates:update');
  const canDelete = grantsPermission(authUser?.permissions, 'estimates:delete');
  const storefront = useStorefrontFilter();

  const [status, setStatus] = useState<'ALL' | EstimateStatus>('ALL');
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Estimate | null>(null);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;
  const fetchPage = isSearching ? 1 : page;

  useEffect(() => {
    setPage(1);
  }, [status, dueOnly, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['estimates', status, dueOnly, search, fetchPage, fetchLimit, storefront.store],
    queryFn: async () =>
      (
        await api.get('/estimates', {
          params: {
            status: status === 'ALL' ? undefined : status,
            dueForFollowUp: dueOnly ? 'true' : undefined,
            search: search || undefined,
            page: fetchPage,
            limit: fetchLimit,
            ...storefront,
          },
        })
      ).data as { estimates: Estimate[]; total: number },
  });
  const estimates = data?.estimates ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/estimates/${id}`)).data,
    onSuccess: () => {
      toast.success('Estimate deleted');
      qc.invalidateQueries({ queryKey: ['estimates'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete estimate'),
  });
  const remove = (e: Estimate) => {
    if (window.confirm(`Delete estimate ${e.number}? This cannot be undone.`)) del.mutate(e.id);
  };

  const convert = (e: Estimate) => navigate(`/pos?estimateId=${e.id}`);

  const isOverdue = (e: Estimate) =>
    !!e.nextFollowUpDate &&
    new Date(e.nextFollowUpDate) < new Date() &&
    (e.status === 'PENDING' || e.status === 'FOLLOWED_UP');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {isSearching ? estimates.length : total} estimate(s)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {(['ALL', 'PENDING', 'FOLLOWED_UP', 'LOST'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={status === value ? 'default' : 'outline'}
                onClick={() => setStatus(value)}
              >
                {value === 'ALL' ? t('All') : t(STATUS_LABEL[value])}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant={dueOnly ? 'default' : 'outline'}
            onClick={() => setDueOnly((v) => !v)}
          >
            {t('Due for follow-up')}
          </Button>
          <div className="w-64 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by estimate #, customer or phone…')}
                className="pl-8"
              />
            </div>
          </div>
          {canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('New Estimate')}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Estimate #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Customer')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                <th className="px-4 py-3 font-medium">{t('Status')}</th>
                <th className="px-4 py-3 font-medium">{t('Next Follow-up')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                estimates.map((e) => {
                  const editable = e.status === 'PENDING' || e.status === 'FOLLOWED_UP';
                  return (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{e.number}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{e.customerName}</p>
                        {e.customerPhone && (
                          <p className="text-xs text-muted-foreground">{e.customerPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(Number(e.grandTotal))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            STATUS_STYLE[e.status],
                          )}
                        >
                          {t(STATUS_LABEL[e.status])}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {e.nextFollowUpDate ? (
                          <span className={isOverdue(e) ? 'font-medium text-destructive' : ''}>
                            {new Date(e.nextFollowUpDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {editable && canManage && (
                            <Button size="sm" variant="outline" onClick={() => setFollowUpFor(e)}>
                              {t('Follow Up')}
                            </Button>
                          )}
                          {editable && canCreate && (
                            <Button size="sm" onClick={() => convert(e)}>
                              <ShoppingCart className="h-3.5 w-3.5" /> {t('Convert')}
                            </Button>
                          )}
                          {editable && canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title={t('Edit')}
                              onClick={() => setEditingEstimate(e)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {!editable && e.convertedSaleId && (
                            <span className="self-center text-xs text-muted-foreground">
                              {t('Converted')}
                            </span>
                          )}
                          {canDelete && e.status !== 'CONVERTED' && (
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
                  );
                })}
              {!isLoading && estimates.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No estimates yet.
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

      {creating && <EstimateDialog estimate={null} open={creating} onOpenChange={setCreating} />}
      {editingEstimate && (
        <EstimateDialog
          estimate={editingEstimate}
          open={editingEstimate !== null}
          onOpenChange={(o) => !o && setEditingEstimate(null)}
        />
      )}
      {followUpFor && (
        <FollowUpDialog estimate={followUpFor} onClose={() => setFollowUpFor(null)} />
      )}
    </div>
  );
}
