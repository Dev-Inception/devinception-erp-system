import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';

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
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  outstanding: number;
}
const PAGE_SIZE = 20;

const emptyForm = { name: '', phone: '', email: '', address: '', ntn: '' };

/** Create (no `supplier`) or edit (with `supplier`) a supplier. */
function SupplierDialog({ supplier, trigger }: { supplier?: Supplier; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!supplier;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Reset the form to the supplier's values (or blank) each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm(
        supplier
          ? {
              name: supplier.name,
              phone: supplier.phone ?? '',
              email: supplier.email ?? '',
              address: supplier.address ?? '',
              ntn: supplier.ntn ?? '',
            }
          : emptyForm,
      );
    }
  }, [open, supplier]);

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (await api.patch(`/suppliers/${supplier!.id}`, form)).data
        : (await api.post('/suppliers', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Supplier updated' : 'Supplier created');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save supplier'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('Edit Supplier') : t('New Supplier')}</DialogTitle>
          <DialogDescription>
            {editing
              ? t('Update this supplier’s details.')
              : t('Add a supplier you receive stock from.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="s-name">{t('Name')} *</Label>
            <Input
              id="s-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">{t('Phone')}</Label>
              <Input
                id="s-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-ntn">{t('NTN')}</Label>
              <Input
                id="s-ntn"
                value={form.ntn}
                onChange={(e) => setForm({ ...form, ntn: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-email">{t('Email')}</Label>
            <Input
              id="s-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-addr">{t('Address')}</Label>
            <Input
              id="s-addr"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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

export function SuppliersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const perms = useAuthStore((s) => s.user?.permissions);
  const canUpdate = grantsPermission(perms, 'suppliers:update');
  const canDelete = grantsPermission(perms, 'suppliers:delete');
  const showActions = canUpdate || canDelete;

  const [page, setPage] = useState(1);

  const storefront = useStorefrontFilter();
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', search, storefront.store],
    queryFn: async () => (await api.get('/suppliers', { params: { search, ...storefront } })).data,
  });

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const total = suppliers?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = isSearching
    ? suppliers
    : suppliers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/suppliers/${id}`)).data,
    onSuccess: () => {
      toast.success('Supplier deleted');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete supplier'),
  });

  const remove = (s: Supplier) => {
    if (window.confirm(`Delete supplier “${s.name}”? This cannot be undone.`)) del.mutate(s.id);
  };

  const colSpan = showActions ? 6 : 5;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('Search')}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search suppliers…')}
              className="w-72 pl-8"
            />
          </div>
        </div>
        <SupplierDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> {t('Add Supplier')}
            </Button>
          }
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Supplier')}</th>
              <th className="px-4 py-3 font-medium">{t('Phone')}</th>
              <th className="px-4 py-3 font-medium">{t('Email')}</th>
              <th className="px-4 py-3 font-medium">{t('NTN')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Outstanding')}</th>
              {showActions && <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              pageItems.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  onClick={() => navigate(`/suppliers/${s.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.ntn ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(s.outstanding)}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <SupplierDialog
                            supplier={s}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={t('Edit')}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t('Delete')}
                            disabled={del.isPending}
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && pageItems.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  {t('No suppliers yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
    </div>
  );
}
