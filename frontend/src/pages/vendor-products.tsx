import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  PackageSearch,
  AlertTriangle,
  ImagePlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/confirm-provider';
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
import { autoSku, cn, resizeImageToDataUrl } from '@/lib/utils';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface VendorProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  image?: string;
  categoryId?: string;
  unitId?: string;
  category?: { name: string } | null;
  unit?: { name?: string; abbreviation: string } | null;
}
interface Catalog {
  categories: { id: string; name: string }[];
  units: { id: string; name: string; abbreviation: string }[];
}

const PAGE_SIZE = 20;
const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

/** Add or edit a vendor product. The vendor and price are chosen on each
 * sale line in the POS, so the product itself only names the item. */
function VendorProductDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: VendorProduct | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['catalog'],
    queryFn: async () => (await api.get('/catalog')).data,
  });
  const [form, setForm] = useState(() => ({
    name: editing?.name ?? '',
    sku: editing?.sku ?? '',
    barcode: editing?.barcode ?? '',
    image: editing?.image ?? '',
    categoryId: editing?.categoryId ?? '',
    unitId: editing?.unitId ?? '',
  }));
  const field = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [imageBusy, setImageBusy] = useState(false);
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setImageBusy(true);
    try {
      field('image', await resizeImageToDataUrl(file));
    } catch {
      toast.error('Could not read that image');
    } finally {
      setImageBusy(false);
    }
  };
  // A new vendor product belongs to the store picked in the header.
  const needsStore = !editing && !hasSpecificStore;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || autoSku(form.name),
        // '' clears a removed barcode/photo on edit (see api.ts productPayload).
        barcode: form.barcode.trim(),
        image: form.image,
        categoryId: form.categoryId || undefined,
        unitId: form.unitId || undefined,
      };
      return editing
        ? (await api.patch(`/products/${editing.id}`, payload)).data
        : (
            await api.post('/products', {
              ...payload,
              isVendorProduct: true,
              store: currentStoreId,
            })
          ).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Vendor product updated' : 'Vendor product added');
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      qc.invalidateQueries({ queryKey: ['pos-vendor-products'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('Edit Vendor Product') : t('New Vendor Product')}</DialogTitle>
          <DialogDescription>
            {t('An item bought from a vendor per sale. Vendor products hold no stock.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {needsStore && (
            <div className="col-span-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('Select a specific store from the header first.')}
            </div>
          )}
          <div className="col-span-2 space-y-1.5">
            <Label>{t('Name')} *</Label>
            <Input
              required
              maxLength={160}
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>{t('Photo')}</Label>
            <div className="flex items-center gap-3">
              <label
                className={cn(
                  'relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted/30 text-muted-foreground hover:border-primary',
                  imageBusy && 'pointer-events-none opacity-60',
                )}
              >
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : imageBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </label>
              {form.image && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => field('image', '')}
                >
                  <X className="h-3.5 w-3.5" /> {t('Remove')}
                </Button>
              )}
            </div>
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
          <div className="space-y-1.5">
            <Label>{t('Barcode')}</Label>
            <Input
              maxLength={60}
              value={form.barcode}
              onChange={(e) => field('barcode', e.target.value)}
            />
          </div>
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
          <div className="col-span-2 flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending || needsStore || !form.name.trim()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The second inventory: items bought from a vendor per sale, never stocked.
 * The POS lists these when a row's source is Vendor; the vendor and price
 * are picked on that row.
 */
export function VendorProductsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const perms = useAuthStore((s) => s.user?.permissions);
  const canManage = grantsPermission(perms, 'inventory:manage');
  const storefront = useStorefrontFilter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorProduct | null>(null);

  const { data: products = [], isLoading } = useQuery<VendorProduct[]>({
    queryKey: ['vendor-products', search, storefront.store],
    queryFn: async () =>
      (
        await api.get('/products', {
          params: { ...storefront, kind: 'vendor', search: search || undefined },
        })
      ).data,
  });

  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => {
      toast.success('Vendor product deleted');
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      qc.invalidateQueries({ queryKey: ['pos-vendor-products'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete product'),
  });
  const confirmDelete = useConfirmDelete();
  const remove = async (p: VendorProduct) => {
    if (await confirmDelete(`vendor product "${p.name}"`)) del.mutate(p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-end gap-3">
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
                placeholder={t('Search products…')}
                className="w-full pl-8 sm:w-72"
              />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            {total} {t('product(s)')}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t('Add Vendor Product')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Product')}</th>
                <th className="px-4 py-3 font-medium">{t('Category')}</th>
                <th className="px-4 py-3 font-medium">{t('Unit')}</th>
                {canManage && <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                pageItems.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                            <PackageSearch className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.sku}
                            {p.barcode ? ` · ${p.barcode}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.unit?.name ?? p.unit?.abbreviation ?? '—'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Edit')}
                            onClick={() => {
                              setEditing(p);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Delete')}
                            disabled={del.isPending}
                            onClick={() => remove(p)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {search
                      ? t('No vendor products match your search.')
                      : t('No vendor products yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
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

      {dialogOpen && (
        <VendorProductDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
