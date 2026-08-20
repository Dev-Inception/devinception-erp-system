import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, HardHat, Loader2, Plus, Search, Trash2 } from 'lucide-react';
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

/**
 * Full-page sale edit — a real product search to add/remove items (not just
 * tweak existing lines), switch any line between a warehouse and a vendor,
 * re-pick labour and their fares, and adjust discount/tax/transport. Unlike
 * the POS checkout flow this route doesn't reuse, there's no customer step
 * (the backend doesn't support changing it) and no payment collection (an
 * edit only recalculates what's still owed — see saleService.updateSale).
 */

interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  currentStock: number;
  warehouseId?: string;
}
type LineSource = 'WAREHOUSE' | 'VENDOR';
interface CartLine {
  key: string;
  productId: string;
  name: string;
  variants: ProductVariant[];
  quantity: number;
  unitPrice: number;
  source: LineSource;
  vendorId?: string;
  vendorName?: string;
  warehouseId?: string;
}
interface WarehouseLite {
  id: string;
  name: string;
}
interface VendorLite {
  id: string;
  name: string;
}
interface LabourLite {
  id: string;
  name: string;
  phoneNumber: string;
}
interface SaleLabourDetail {
  id: string;
  name: string;
  phone?: string;
  rent: number;
}
interface SaleDetail {
  id: string;
  saleNumber: string;
  customer?: { name: string; phone?: string };
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number | string;
    source?: LineSource;
    vendorId?: string;
    vendorName?: string;
    warehouseId?: string;
  }[];
  discountTotal: number | string;
  taxPercent: number | string;
  transportFare?: number | string;
  labour?: SaleLabourDetail[];
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  returnedTotal?: number | string;
}

const groupKey = (p: { sku?: string; name: string }) => (p.sku || p.name).trim().toLowerCase();

export function SaleEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManageSales = grantsPermission(authUser?.permissions, 'sales:update');

  const [lines, setLines] = useState<CartLine[]>([]);
  const [selectedLabour, setSelectedLabour] = useState<SaleLabourDetail[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [transportFare, setTransportFare] = useState(0);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: sale, isLoading } = useQuery<SaleDetail>({
    queryKey: ['sale', id],
    queryFn: async () => (await api.get(`/sales/${id}`)).data,
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!sale || hydrated) return;
    setLines(
      sale.items.map((it, idx) => ({
        key: `${it.productId}-${idx}`,
        productId: it.productId,
        name: it.name,
        variants: [],
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        source: it.source ?? 'WAREHOUSE',
        vendorId: it.vendorId,
        vendorName: it.vendorName,
        warehouseId: it.warehouseId,
      })),
    );
    setSelectedLabour(sale.labour ?? []);
    setDiscount(Number(sale.discountTotal));
    setTaxPercent(Number(sale.taxPercent ?? 0));
    setTransportFare(Number(sale.transportFare ?? 0));
    setDriverName(sale.transport?.driverName ?? '');
    setDriverPhone(sale.transport?.driverPhone ?? '');
    setVehicleNumber(sale.transport?.vehicleNumber ?? '');
    setHydrated(true);
  }, [sale, hydrated]);

  const { data: products = [] } = useQuery<ProductVariant[]>({
    queryKey: ['edit-sale-products', search],
    queryFn: async () =>
      (await api.get('/products', { params: { search, perWarehouse: true } })).data,
    enabled: pickerOpen,
  });
  const { data: warehouses = [] } = useQuery<WarehouseLite[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
  });
  const { data: vendors = [] } = useQuery<VendorLite[]>({
    queryKey: ['vendors'],
    queryFn: async () => (await api.get('/vendors')).data,
  });
  const { data: labourList = [] } = useQuery<LabourLite[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });

  const groupedMatches = (() => {
    const map = new Map<string, ProductVariant[]>();
    for (const p of products) {
      const k = groupKey(p);
      const arr = map.get(k);
      if (arr) arr.push(p);
      else map.set(k, [p]);
    }
    return Array.from(map.values());
  })();

  const addLine = (variants: ProductVariant[]) => {
    const key = groupKey(variants[0]);
    setLines((ls) => {
      if (ls.some((l) => l.key === key)) {
        return ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      const preferred = variants.find((v) => v.currentStock > 0) || variants[0];
      return [
        ...ls,
        {
          key,
          productId: preferred.id,
          name: preferred.name,
          variants,
          quantity: 1,
          unitPrice: Number(preferred.salePrice),
          source: 'WAREHOUSE',
          warehouseId: preferred.warehouseId,
        },
      ];
    });
    setSearch('');
    setPickerOpen(false);
    searchRef.current?.blur();
  };

  const setLineQty = (key: string, quantity: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity } : l)));
  const setLinePrice = (key: string, unitPrice: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unitPrice } : l)));
  const setLineWarehouse = (key: string, warehouseId: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, warehouseId } : l)));
  const setLineVendor = (key: string, vendorId: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const vendor = vendors.find((v) => v.id === vendorId);
        return { ...l, vendorId: vendor?.id, vendorName: vendor?.name };
      }),
    );
  const setLineSource = (key: string, source: LineSource) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (source === 'WAREHOUSE') {
          return {
            ...l,
            source,
            vendorId: undefined,
            vendorName: undefined,
            warehouseId: l.warehouseId ?? warehouses[0]?.id,
          };
        }
        const vendor = vendors.find((v) => v.id === l.vendorId) ?? vendors[0];
        return { ...l, source, vendorId: vendor?.id, vendorName: vendor?.name };
      }),
    );
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const addLabour = (labourId: string) => {
    const l = labourList.find((x) => x.id === labourId);
    if (!l || selectedLabour.some((s) => s.id === l.id)) return;
    setSelectedLabour((sel) => [...sel, { id: l.id, name: l.name, phone: l.phoneNumber, rent: 0 }]);
  };
  const setLabourRent = (labourId: string, rent: number) =>
    setSelectedLabour((sel) => sel.map((l) => (l.id === labourId ? { ...l, rent } : l)));
  const removeLabour = (labourId: string) =>
    setSelectedLabour((sel) => sel.filter((l) => l.id !== labourId));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, discount));
  const net = subtotal - discountAmount;
  const taxAmount = (net * Math.max(0, taxPercent)) / 100;
  const labourRentTotal = selectedLabour.reduce((s, l) => s + (l.rent || 0), 0);
  const total = Math.max(0, net + taxAmount + Math.max(0, transportFare) + labourRentTotal);

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/sales/${id}`, {
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            source: l.source,
            vendor: l.source === 'VENDOR' ? l.vendorId : undefined,
            warehouseId: l.source === 'VENDOR' ? undefined : l.warehouseId,
          })),
          discountTotal: discountAmount,
          taxPercent: Math.max(0, taxPercent),
          transportFare: Math.max(0, transportFare),
          transport: { driverName, driverPhone, vehicleNumber },
          labour: selectedLabour.map((l) => ({ labour: l.id, rent: l.rent || 0 })),
        })
      ).data,
    onSuccess: () => {
      toast.success('Sale updated');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sale', id] });
      navigate('/sales');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update sale'),
  });

  const isLocked = Number(sale?.returnedTotal ?? 0) > 0;
  const canSubmit =
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0 && (l.source !== 'VENDOR' || l.vendorId)) &&
    !submit.isPending;

  if (!canManageSales) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        You don't have permission to edit sales.
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">
            {t('Edit Sale')} {sale ? `— ${sale.saleNumber}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sale?.customer?.name ?? (isLoading ? t('Loading…') : 'Walk-in')} — stock and accounting
            are reversed and reapplied for the revised items.
          </p>
        </div>
      </div>

      {isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t('Loading…')}</Card>
      )}

      {sale && isLocked && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t(
            "This sale has product returns against it and can no longer be edited — undo isn't supported, so returns and item edits can never be combined on the same sale.",
          )}
        </Card>
      )}

      {sale && !isLocked && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Label className="text-sm font-semibold">{t('Items')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder={t('Search products to add…')}
                className="pl-8"
              />
              {pickerOpen && search.trim().length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {groupedMatches.length === 0 && (
                    <p className="p-3 text-center text-sm text-muted-foreground">
                      {t('No products found')}
                    </p>
                  )}
                  {groupedMatches.map((variants) => {
                    const p = variants[0];
                    const inCart = lines.some((l) => l.key === groupKey(p));
                    return (
                      <button
                        key={groupKey(p)}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addLine(variants)}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {formatCurrency(Number(p.salePrice))}
                          {inCart && <Check className="h-4 w-4 text-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="space-y-1.5 rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => removeLine(l.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select
                      className="h-8 rounded-md border bg-transparent px-2 text-xs"
                      value={l.source}
                      onChange={(e) => setLineSource(l.key, e.target.value as LineSource)}
                    >
                      <option value="WAREHOUSE">{t('Warehouse')}</option>
                      <option value="VENDOR">{t('Vendor')}</option>
                    </select>
                    {l.source === 'VENDOR' ? (
                      <select
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        value={l.vendorId ?? ''}
                        onChange={(e) => setLineVendor(l.key, e.target.value)}
                      >
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        value={l.warehouseId ?? ''}
                        onChange={(e) => setLineWarehouse(l.key, e.target.value)}
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder={t('Qty')}
                      className="h-8 text-right"
                      value={l.quantity || ''}
                      onChange={(e) => setLineQty(l.key, Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t('Price')}
                      className="h-8 text-right"
                      value={l.unitPrice || ''}
                      onChange={(e) => setLinePrice(l.key, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t('Every line was removed — a sale needs at least one item.')}
                </p>
              )}
            </div>
          </Card>

          <Card className="space-y-2 p-4">
            <Label className="text-sm font-semibold">{t('Labour')}</Label>
            {selectedLabour.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm"
              >
                <HardHat className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <Input
                  type="number"
                  min={0}
                  placeholder={t('Fare')}
                  className="h-8 w-24 text-right"
                  value={l.rent || ''}
                  onChange={(e) => setLabourRent(l.id, Number(e.target.value))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={() => removeLabour(l.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {selectedLabour.length === 0 && (
              <p className="py-1 text-center text-xs text-muted-foreground">
                {t('No labour assigned.')}
              </p>
            )}
            {labourList.filter((l) => !selectedLabour.some((s) => s.id === l.id)).length > 0 && (
              <div className="relative">
                <select
                  className="h-8 w-full appearance-none rounded-md border bg-transparent px-2 pr-7 text-xs text-muted-foreground"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addLabour(e.target.value);
                  }}
                >
                  <option value="">{t('+ Add labour…')}</option>
                  {labourList
                    .filter((l) => !selectedLabour.some((s) => s.id === l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
                <Plus className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
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
            <div className="space-y-1.5">
              <Label>{t('Transport fare')}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={transportFare || ''}
                onChange={(e) => setTransportFare(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Vehicle number')}</Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Driver name')}</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Driver phone')}</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
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
            {transportFare > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t('Transport Fare')}</span>
                <span>{formatCurrency(transportFare)}</span>
              </div>
            )}
            {labourRentTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t('Labour Fare')}</span>
                <span>{formatCurrency(labourRentTotal)}</span>
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
