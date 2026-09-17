import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HandCoins,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontStore } from '@/store/storefront';
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
interface CompletedVendorSale {
  number: string;
  vendorName: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  creditAmount: number;
  advance: number;
}

const ADVANCE_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
] as const;

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Vendor' },
  { n: 2, label: 'Products' },
  { n: 3, label: 'Payment' },
  { n: 4, label: 'Done' },
];

/* ── New Vendor Sale — a full step-wise flow (Vendor → Products → Payment →
   Done), the same shape as the POS checkout, instead of a single form. ── */
export function VendorSaleNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canTakeAdvance = grantsPermission(authUser?.permissions, 'finance:manage');
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const { warehouses, currentId: defaultWarehouseId } = useWarehouses();

  const [step, setStep] = useState<Step>(1);

  // Step 1 — vendor + warehouse
  const [vendorId, setVendorId] = useState<string | undefined>(undefined);
  const [vendorName, setVendorName] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || '');

  // Step 2 — products
  const [lines, setLines] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Step 3 — payment
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [note, setNote] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [advanceBankAccountId, setAdvanceBankAccountId] = useState('');
  const [advanceTransactionId, setAdvanceTransactionId] = useState('');

  // Step 4 — result
  const [completedSale, setCompletedSale] = useState<CompletedVendorSale | null>(null);

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
    enabled: step === 1,
  });
  const { data: products = [] } = useQuery<ProductLite[]>({
    queryKey: ['vendor-sale-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
    enabled: step === 2,
  });

  const needsAdvanceBank = advanceMethod === 'BANK_TRANSFER';
  const { data: advanceBankAccounts = [] } = useBankAccounts(
    hasSpecificStore ? currentStoreId : undefined,
    step === 3 && canTakeAdvance && needsAdvanceBank,
  );
  const activeAdvanceBankAccounts = advanceBankAccounts.filter((b) => b.isActive);

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
  const advance = canTakeAdvance ? Math.min(Math.max(0, advanceAmount), total) : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a sale.');
      }
      // Every vendor sale is booked on account first, same as a POS sale —
      // the optional advance below is then recorded separately against the
      // vendor-receivable ledger.
      const sale = (
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
          paymentMethod: 'CREDIT',
          note: note || undefined,
        })
      ).data;

      if (advance > 0) {
        // The vendor-receivable endpoint has no dedicated transaction-ID
        // field, so fold it into the note the same way saleService does
        // for a POS advance payment.
        const advanceNote = [
          `Advance for vendor sale ${sale.number}`,
          needsAdvanceBank && advanceTransactionId ? `Txn ID: ${advanceTransactionId}` : null,
        ]
          .filter(Boolean)
          .join(' — ');
        await api.post('/finance/payments/vendor-receivable/receive', {
          vendor: vendorId,
          store: currentStoreId,
          amount: advance,
          method: advanceMethod,
          bankAccount: needsAdvanceBank ? advanceBankAccountId || undefined : undefined,
          note: advanceNote,
        });
      }

      return sale;
    },
    onSuccess: (sale) => {
      toast.success('Vendor sale recorded');
      qc.invalidateQueries({ queryKey: ['vendor-sales'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledger'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledgers'] });
      setCompletedSale({
        number: sale.number,
        vendorName: sale.vendorName,
        items: sale.items,
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        total: sale.total,
        creditAmount: sale.creditAmount,
        advance,
      });
      setStep(4);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const resetAll = () => {
    setVendorId(undefined);
    setVendorName('');
    setVendorSearch('');
    setWarehouseId(defaultWarehouseId || '');
    setLines([]);
    setProductSearch('');
    setDiscount(0);
    setTaxPercent(0);
    setNote('');
    setAdvanceAmount(0);
    setAdvanceMethod('CASH');
    setAdvanceBankAccountId('');
    setAdvanceTransactionId('');
    setCompletedSale(null);
    setStep(1);
  };

  const canStep1 = !!vendorId && !!warehouseId;
  const canStep2 = lines.length > 0 && lines.every((l) => l.quantity > 0);
  const canSubmit =
    canStep1 &&
    canStep2 &&
    (advance <= 0 || !needsAdvanceBank || advanceBankAccountId) &&
    hasSpecificStore &&
    !save.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/vendor-sales')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HandCoins className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold leading-tight">{t('New Vendor Sale')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(STEPS.find((s) => s.n === step)?.label ?? '')} — {t('step')} {step} {t('of')}{' '}
            {STEPS.length}
          </p>
        </div>
      </div>

      <Card className="flex flex-col p-6">
        {/* Stepper */}
        <div className="mb-6 flex items-start">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="flex items-start"
              style={i < STEPS.length - 1 ? { flex: '1 1 0%' } : { flex: '0 0 auto' }}
            >
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    step === s.n
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : step > s.n
                        ? 'border-success bg-success text-success-foreground'
                        : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap text-[11px] font-medium',
                    step === s.n ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(s.label)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mt-4 h-0.5 flex-1 rounded-full transition-colors',
                    step > s.n ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="py-2">
          {step === 1 && (
            <div className="mx-auto max-w-md space-y-5 py-4">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <HandCoins className="h-6 w-6" />
                </div>
                <h2 className="text-base font-semibold">{t('Which vendor is buying?')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('Pick the vendor and the warehouse this stock ships from.')}
                </p>
              </div>

              {vendorId ? (
                <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{vendorName}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={clearVendor}
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      onFocus={() => setVendorPickerOpen(true)}
                      onBlur={() => setTimeout(() => setVendorPickerOpen(false), 150)}
                      placeholder={t('Search an existing vendor…')}
                      className="pl-9"
                    />
                    {vendorPickerOpen && (
                      <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                        {vendorMatches.length === 0 ? (
                          <p className="p-3 text-center text-sm text-muted-foreground">
                            {t('No matches')}
                          </p>
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
                      <Button type="button" variant="outline" className="w-full">
                        <Plus className="h-4 w-4" /> {t('New vendor (first-time buyer)')}
                      </Button>
                    }
                  />
                </div>
              )}

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
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-full space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  ref={productSearchRef}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onFocus={() => setProductPickerOpen(true)}
                  onBlur={() => setTimeout(() => setProductPickerOpen(false), 150)}
                  placeholder={t('Search products to add…')}
                  className="h-11 pl-9"
                />
                {productPickerOpen && (
                  <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                    {products.length === 0 ? (
                      <p className="p-3 text-center text-sm text-muted-foreground">
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
                            className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
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

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Price')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Total')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                          {t('Search and select a product to add it here')}
                        </td>
                      </tr>
                    )}
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
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(l.quantity * l.unitPrice)}
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
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-md space-y-3">
              {!hasSpecificStore && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t('Select a specific store from the header before recording a sale.')}
                </p>
              )}

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

              {canTakeAdvance ? (
                <div className="space-y-2 border-t pt-3">
                  <Label>{t('Advance payment (optional)')}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={advanceAmount || ''}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                  />
                  {advance > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ADVANCE_METHODS.map((m) => (
                          <Button
                            key={m.value}
                            type="button"
                            size="sm"
                            variant={advanceMethod === m.value ? 'default' : 'outline'}
                            onClick={() => setAdvanceMethod(m.value)}
                          >
                            {t(m.label)}
                          </Button>
                        ))}
                      </div>
                      {needsAdvanceBank && (
                        <>
                          <select
                            required
                            value={advanceBankAccountId}
                            onChange={(e) => setAdvanceBankAccountId(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                          >
                            <option value="">{t('Select account…')}</option>
                            {activeAdvanceBankAccounts.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <Input
                            value={advanceTransactionId}
                            onChange={(e) => setAdvanceTransactionId(e.target.value)}
                            placeholder={t('Transaction ID from the vendor')}
                          />
                        </>
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {advance <= 0
                      ? t("No advance — the full amount goes on the vendor's account.")
                      : advance >= total
                        ? t('Paid in full now.')
                        : `${formatCurrency(total - advance)} ${t("remains on the vendor's account.")}`}
                  </p>
                </div>
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("This sale will be invoiced on the vendor's account.")}
                </p>
              )}
            </div>
          )}

          {step === 4 && completedSale && (
            <div className="mx-auto max-w-md space-y-4">
              <div className="flex flex-col items-center gap-1 rounded-lg bg-success/10 p-4 text-center text-success">
                <CheckCircle2 className="h-7 w-7" />
                <span className="font-medium">
                  {t('Vendor sale')} {completedSale.number} {t('recorded')}
                </span>
              </div>

              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('Vendor')}</span>
                  <span className="font-medium">{completedSale.vendorName}</span>
                </div>

                <div className="mt-1 space-y-1 border-t pt-2">
                  {completedSale.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        {it.name} × {it.quantity}
                      </span>
                      <span className="shrink-0 font-medium text-foreground">
                        {formatCurrency(Number(it.lineTotal))}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-1 space-y-1 border-t pt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Subtotal')}</span>
                    <span>{formatCurrency(Number(completedSale.subtotal))}</span>
                  </div>
                  {Number(completedSale.discount) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Discount')}</span>
                      <span>−{formatCurrency(Number(completedSale.discount))}</span>
                    </div>
                  )}
                  {Number(completedSale.tax) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Tax')}</span>
                      <span>{formatCurrency(Number(completedSale.tax))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold">
                    <span>{t('Total')}</span>
                    <span>{formatCurrency(Number(completedSale.total))}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Advance received')}</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(completedSale.advance)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Remaining on account')}</span>
                    <span
                      className={cn(
                        'font-medium',
                        Number(completedSale.creditAmount) - completedSale.advance > 0
                          ? 'text-destructive'
                          : 'text-success',
                      )}
                    >
                      {formatCurrency(
                        Math.max(0, Number(completedSale.creditAmount) - completedSale.advance),
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => navigate('/vendor-sales')}
              >
                {t('Back to Vendor Sales')}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            disabled={step === 1 || step === 4 || save.isPending}
            onClick={() => setStep((s) => (s - 1) as Step)}
          >
            <ArrowLeft className="h-4 w-4" /> {t('Back')}
          </Button>
          {step === 1 && (
            <Button disabled={!canStep1} onClick={() => setStep(2)}>
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button disabled={!canStep2} onClick={() => setStep(3)}>
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button disabled={!canSubmit} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Record Sale')}
            </Button>
          )}
          {step === 4 && <Button onClick={resetAll}>{t('New Vendor Sale')}</Button>}
        </div>
      </Card>
    </div>
  );
}
