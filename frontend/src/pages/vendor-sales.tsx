import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HandCoins, Loader2, Plus, Search, Trash2, UserX } from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { useWarehouses } from '@/components/layout/warehouse-switcher';
import { useBankAccounts } from '@/lib/bankAccounts';
import { VendorDialog } from '@/pages/vendors';

interface VendorLite {
  id: string;
  name: string;
  phone?: string;
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
export interface VendorSale {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
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
}

const PAGE_SIZE = 20;
const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'CARD', label: 'Card' },
  { value: 'MIXED', label: 'Mixed (cash + online)' },
  { value: 'CREDIT', label: 'On account (credit)' },
];

/* ── New Vendor Sale — pick (or create) the buying vendor, a warehouse,
   search products to build the cart, discount/tax, and settle the total. ── */
function CreateVendorSaleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const { warehouses, currentId: defaultWarehouseId } = useWarehouses();

  const [vendorId, setVendorId] = useState<string | undefined>(undefined);
  const [vendorName, setVendorName] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');

  const [lines, setLines] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [note, setNote] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashReceived, setCashReceived] = useState(0);
  const [onlineReceived, setOnlineReceived] = useState(0);
  const [bankAccount, setBankAccount] = useState('');

  useEffect(() => {
    if (!warehouseId && defaultWarehouseId) setWarehouseId(defaultWarehouseId);
  }, [defaultWarehouseId, warehouseId]);

  const vendorSearchTerm = vendorSearch.trim();
  const { data: vendorMatches = [] } = useQuery<VendorLite[]>({
    queryKey: ['vendor-sale-vendor-search', vendorSearchTerm, currentStoreId],
    queryFn: async () =>
      (
        await api.get('/vendors', {
          params: {
            search: vendorSearchTerm,
            store: hasSpecificStore ? currentStoreId : undefined,
          },
        })
      ).data,
    enabled: vendorPickerOpen,
  });
  const { data: products = [] } = useQuery<ProductLite[]>({
    queryKey: ['vendor-sale-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
  });

  const needsBank = paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'ONLINE';
  const needsMixedInputs = paymentMethod === 'MIXED';
  const { data: bankAccounts = [] } = useBankAccounts(
    hasSpecificStore ? currentStoreId : undefined,
    needsBank || needsMixedInputs,
  );
  const activeBankAccounts = bankAccounts.filter((b) => b.isActive);

  const pickVendor = (v: VendorLite) => {
    setVendorId(v.id);
    setVendorName(v.name);
    setVendorSearch('');
    setVendorPickerOpen(false);
  };
  const clearVendor = () => {
    setVendorId(undefined);
    setVendorName('');
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
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a sale.');
      }
      return (
        await api.post('/vendor-sales', {
          vendorId,
          storeId: currentStoreId,
          warehouseId,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          discount: discountAmount,
          taxPercent: Math.max(0, taxPercent),
          paymentMethod,
          cashAmount: paymentMethod === 'MIXED' ? cashReceived : undefined,
          onlineAmount: paymentMethod === 'MIXED' ? onlineReceived : undefined,
          bankAccountId: needsBank ? bankAccount || undefined : undefined,
          note: note || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success('Vendor sale recorded');
      qc.invalidateQueries({ queryKey: ['vendor-sales'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledger'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const canSubmit =
    !!vendorId &&
    !!warehouseId &&
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0) &&
    (!needsBank || bankAccount) &&
    hasSpecificStore &&
    !save.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4" /> {t('New Vendor Sale')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Sell stock directly to a vendor — issued from the selected warehouse, same as a POS sale.',
            )}
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
            <Label>{t('Vendor')}</Label>
            {vendorId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{vendorName}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={clearVendor}
                >
                  <UserX className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    onFocus={() => setVendorPickerOpen(true)}
                    onBlur={() => setTimeout(() => setVendorPickerOpen(false), 150)}
                    placeholder={t('Search an existing vendor…')}
                    className="pl-8"
                  />
                  {vendorPickerOpen && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                      {vendorMatches.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">{t('No matches')}</p>
                      ) : (
                        vendorMatches.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickVendor(v)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span>{v.name}</span>
                            <span className="text-xs text-muted-foreground">{v.phone}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <VendorDialog
                  onCreated={(v) => pickVendor(v)}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      <Plus className="h-4 w-4" /> {t('New vendor (first-time buyer)')}
                    </Button>
                  }
                />
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('Warehouse')}</Label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              required
            >
              <option value="">{t('Select warehouse…')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
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
            <Label>{t('Payment')}</Label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </div>

          {needsMixedInputs && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('Cash received')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashReceived || ''}
                  onChange={(e) => setCashReceived(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('Online received')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={onlineReceived || ''}
                  onChange={(e) => setOnlineReceived(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {(needsBank || needsMixedInputs) && (
            <div className="space-y-1.5">
              <Label>
                {t('Bank account')} {needsBank && '*'}
              </Label>
              <select
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                required={needsBank}
              >
                <option value="">{t('Select account…')}</option>
                {activeBankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('Note (optional)')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
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

          {!hasSpecificStore && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t('Select a specific store from the header before recording a sale.')}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('Record Sale')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VendorSaleDetailDialog({
  sale,
  onClose,
}: {
  sale: VendorSale;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
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
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(sale.total)}</td>
              </tr>
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
          {sale.creditAmount > 0 && (
            <div>
              <span className="text-muted-foreground">{t('On account')}: </span>
              {formatCurrency(sale.creditAmount)}
            </div>
          )}
        </div>

        {sale.note && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t('Note')}: </span>
            {sale.note}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<VendorSale | null>(null);

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
          <Button onClick={() => setCreating(true)}>
            <HandCoins className="h-4 w-4" /> {t('New Vendor Sale')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Sale #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Vendor')}</th>
                <th className="px-4 py-3 font-medium">{t('Warehouse')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Items')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
                <th className="px-4 py-3 font-medium">{t('Payment')}</th>
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
                sales.map((s) => (
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
                    <td className="px-4 py-3 text-muted-foreground">{s.warehouseName ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {s.items.length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(s.total)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.paymentMethod}</td>
                  </tr>
                ))}
              {!isLoading && sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
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

      {creating && <CreateVendorSaleDialog onClose={() => setCreating(false)} />}
      {viewing && <VendorSaleDetailDialog sale={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
