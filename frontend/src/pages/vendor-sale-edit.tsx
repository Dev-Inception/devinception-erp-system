import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, HandCoins, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useLanguage } from '@/components/language-provider';
import type { VendorSale } from '@/pages/vendor-sales';

/**
 * Full-page vendor-sale edit — same shape as SaleEditPage: a real product
 * search to add/remove/re-price lines and pick the warehouse, with stock and
 * the revenue/COGS journal entries reversed and reapplied for the revised
 * items (see vendorSaleService.updateVendorSale). No vendor step — the
 * backend doesn't support changing it — and no payment collection, since an
 * edit only recalculates what's still owed on the vendor's account.
 */

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
}
interface WarehouseLite {
  id: string;
  name: string;
}
interface CartLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export function VendorSaleEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'vendor-sales:manage');

  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [note, setNote] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const { data: sale, isLoading } = useQuery<VendorSale>({
    queryKey: ['vendor-sale', id],
    queryFn: async () => (await api.get(`/vendor-sales/${id}`)).data,
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!sale || hydrated) return;
    setWarehouseId(sale.warehouseId ?? '');
    setLines(
      sale.items.map((it, idx) => ({
        key: `${it.productId}-${idx}`,
        productId: it.productId,
        name: it.name,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })),
    );
    setDiscount(Number(sale.discount));
    setTaxPercent(Number(sale.taxPercent ?? 0));
    setNote(sale.note ?? '');
    setHydrated(true);
  }, [sale, hydrated]);

  const { data: products = [] } = useQuery<ProductLite[]>({
    queryKey: ['vendor-sale-edit-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
    enabled: productPickerOpen,
  });
  const { data: warehouses = [] } = useQuery<WarehouseLite[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
  });

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

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/vendor-sales/${id}`, {
          warehouseId,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          discount: discountAmount,
          taxPercent: Math.max(0, taxPercent),
          note: note || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Vendor sale updated');
      qc.invalidateQueries({ queryKey: ['vendor-sales'] });
      qc.invalidateQueries({ queryKey: ['vendor-sale', id] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledger'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledgers'] });
      navigate('/vendor-sales');
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ??
          e?.response?.data?.message ??
          'Could not update vendor sale',
      ),
  });

  const isLocked = Number(sale?.returnedTotal ?? 0) > 0;
  const canSubmit =
    lines.length > 0 && lines.every((l) => l.quantity > 0) && !!warehouseId && !submit.isPending;

  if (!canManage) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        You don't have permission to edit vendor sales.
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/vendor-sales')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HandCoins className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">
            {t('Edit Vendor Sale')} {sale ? `— ${sale.number}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sale?.vendorName ?? (isLoading ? t('Loading…') : '')} —{' '}
            {t('stock and accounting are reversed and reapplied for the revised items.')}
          </p>
        </div>
      </div>

      {isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t('Loading…')}</Card>
      )}

      {sale && isLocked && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t(
            "This vendor sale has product returns against it and can no longer be edited — undo isn't supported, so returns and item edits can never be combined on the same sale.",
          )}
        </Card>
      )}

      {sale && !isLocked && (
        <div className="space-y-4">
          <Card className="space-y-1.5 p-4">
            <Label>{t('Warehouse')}</Label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{t('Select warehouse…')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Card>

          <Card className="space-y-3 p-4">
            <Label className="text-sm font-semibold">{t('Items')}</Label>
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
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
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
                          className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
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
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('Product')}</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">{t('Qty')}</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">{t('Price')}</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">{t('Total')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                        {t('Every line was removed — a vendor sale needs at least one item.')}
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
          </Card>

          <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t('Note (optional)')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </Card>

          <Card className="space-y-1 p-4 text-sm">
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
              <span>{t('New Total')}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </Card>

          <Button className="w-full" disabled={!canSubmit} onClick={() => submit.mutate()}>
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Save Changes')}
          </Button>
        </div>
      )}
    </div>
  );
}
