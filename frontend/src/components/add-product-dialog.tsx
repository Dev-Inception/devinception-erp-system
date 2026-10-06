import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
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
import { api } from '@/lib/api';
import { autoSku } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

/** The product as the API returns it after creation (see lib/api.ts mapProduct). */
export interface CreatedProduct {
  id: string;
  name: string;
  sku: string;
  salePrice: number;
  taxRate: number;
  warehouseId?: string;
  isVendorProduct?: boolean;
  image?: string;
}
interface Catalog {
  categories: { id: string; name: string }[];
  units: { id: string; name: string; abbreviation: string }[];
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

/**
 * "Add" from a product search that found nothing (the POS row picker): opens
 * with the typed name and creates the product in the row's inventory — a
 * warehouse product (with its warehouse and prices) or a vendor product
 * (vendor and price are picked on the sale line). `onCreated` receives the
 * new product so the caller can put it straight on the row.
 */
export function AddProductDialog({
  kind,
  initialName,
  storeId,
  warehouses = [],
  defaultWarehouseId,
  onCreated,
  onClose,
}: {
  kind: 'warehouse' | 'vendor';
  initialName: string;
  /** Store a vendor product is created in; required for kind 'vendor'. */
  storeId?: string;
  warehouses?: { id: string; name: string }[];
  defaultWarehouseId?: string;
  onCreated: (product: CreatedProduct) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isVendor = kind === 'vendor';
  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['catalog'],
    queryFn: async () => (await api.get('/catalog')).data,
  });
  const [form, setForm] = useState({
    name: initialName.trim(),
    sku: '',
    categoryId: '',
    unitId: '',
    warehouseId: defaultWarehouseId || warehouses[0]?.id || '',
    purchasePrice: 0,
    salePrice: 0,
  });
  const field = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const blocker = isVendor
    ? !storeId && t('Select a specific store from the header first.')
    : !form.warehouseId && t('Add a warehouse first.');

  const save = useMutation({
    mutationFn: async () => {
      const base = {
        name: form.name.trim(),
        sku: form.sku.trim() || autoSku(form.name),
        categoryId: form.categoryId || undefined,
        unitId: form.unitId || undefined,
      };
      const payload = isVendor
        ? { ...base, isVendorProduct: true, store: storeId, salePrice: 0 }
        : {
            ...base,
            warehouseId: form.warehouseId,
            purchasePrice: form.purchasePrice,
            salePrice: form.salePrice,
          };
      return (await api.post('/products', payload)).data as CreatedProduct;
    },
    onSuccess: (product) => {
      toast.success(`${t('Product added')} — ${product.name}`);
      qc.invalidateQueries({ queryKey: [isVendor ? 'pos-vendor-products' : 'pos-products'] });
      qc.invalidateQueries({ queryKey: [isVendor ? 'vendor-products' : 'products'] });
      onCreated(product);
      onClose();
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ??
          e?.response?.data?.message ??
          e?.message ??
          t('Could not add the product'),
      ),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isVendor ? t('New Vendor Product') : t('New Product')}</DialogTitle>
          <DialogDescription>
            {isVendor
              ? t('Added to Vendor Products. Pick the vendor and price on the sale row.')
              : t('Added to Warehouse Inventory. Stock it in with a stock receipt.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocker) save.mutate();
          }}
        >
          {blocker && (
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {blocker}
            </div>
          )}
          <div className="col-span-2 space-y-1.5">
            <Label>{t('Name')} *</Label>
            <Input
              required
              autoFocus
              maxLength={160}
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('SKU')}</Label>
            <Input
              maxLength={60}
              value={form.sku}
              placeholder={t('Auto-generated if blank')}
              onChange={(e) => field('sku', e.target.value)}
            />
          </div>
          {!isVendor && (
            <div className="space-y-1.5">
              <Label>{t('Warehouse')} *</Label>
              <select
                required
                className={selectClass}
                value={form.warehouseId}
                onChange={(e) => field('warehouseId', e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('Category')}</Label>
            <select
              className={selectClass}
              value={form.categoryId}
              onChange={(e) => field('categoryId', e.target.value)}
            >
              <option value="">{t('None')}</option>
              {(catalog?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('Unit')}</Label>
            <select
              className={selectClass}
              value={form.unitId}
              onChange={(e) => field('unitId', e.target.value)}
            >
              <option value="">{t('None')}</option>
              {(catalog?.units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          {!isVendor && (
            <>
              <div className="space-y-1.5">
                <Label>{t('Purchase price')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchasePrice || ''}
                  onChange={(e) => field('purchasePrice', Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('Sale price')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.salePrice || ''}
                  onChange={(e) => field('salePrice', Number(e.target.value))}
                />
              </div>
            </>
          )}
          <div className="col-span-2 flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending || !!blocker || !form.name.trim()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Add Product')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
