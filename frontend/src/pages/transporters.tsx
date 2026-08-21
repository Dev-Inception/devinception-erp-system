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

interface Transporter {
  id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
  address?: string;
  outstanding: number;
}
const PAGE_SIZE = 20;

const emptyForm = { name: '', phone: '', vehicleNumber: '', address: '' };

/** Create (no `transporter`) or edit (with `transporter`) a transporter. */
function TransporterDialog({
  transporter,
  trigger,
}: {
  transporter?: Transporter;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!transporter;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(
        transporter
          ? {
              name: transporter.name,
              phone: transporter.phone ?? '',
              vehicleNumber: transporter.vehicleNumber ?? '',
              address: transporter.address ?? '',
            }
          : emptyForm,
      );
    }
  }, [open, transporter]);

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (await api.patch(`/transporters/${transporter!.id}`, form)).data
        : (await api.post('/transporters', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Transporter updated' : 'Transporter created');
      qc.invalidateQueries({ queryKey: ['transporters'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save transporter'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Transporter' : 'New Transporter'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update this transporter’s details.' : 'Add a transporter/trucker.'}
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
            <Label htmlFor="tr-name">Name *</Label>
            <Input
              id="tr-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-phone">Phone</Label>
              <Input
                id="tr-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-vehicle">Vehicle Number</Label>
              <Input
                id="tr-vehicle"
                value={form.vehicleNumber}
                onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-addr">Address</Label>
            <Input
              id="tr-addr"
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

export function TransportersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const perms = useAuthStore((s) => s.user?.permissions);
  const canUpdate = grantsPermission(perms, 'transporters:update');
  const canDelete = grantsPermission(perms, 'transporters:delete');
  const showActions = canUpdate || canDelete;

  const [page, setPage] = useState(1);

  const storefront = useStorefrontFilter();
  const { data: transporters = [], isLoading } = useQuery<Transporter[]>({
    queryKey: ['transporters', search, storefront.store],
    queryFn: async () =>
      (await api.get('/transporters', { params: { search, ...storefront } })).data,
  });

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const total = transporters?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/transporters/${id}`)).data,
    onSuccess: () => {
      toast.success('Transporter deleted');
      qc.invalidateQueries({ queryKey: ['transporters'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete transporter'),
  });

  const remove = (tr: Transporter) => {
    if (window.confirm(`Delete transporter “${tr.name}”? This cannot be undone.`))
      del.mutate(tr.id);
  };

  const colSpan = showActions ? 5 : 4;

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
              placeholder={t('Search transporters…')}
              className="w-72 pl-8"
            />
          </div>
        </div>
        <TransporterDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> {t('Add Transporter')}
            </Button>
          }
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Transporter')}</th>
              <th className="px-4 py-3 font-medium">{t('Phone')}</th>
              <th className="px-4 py-3 font-medium">{t('Vehicle Number')}</th>
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
              transporters.map((tr) => (
                <tr
                  key={tr.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  onClick={() => navigate(`/transporters/${tr.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{tr.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tr.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tr.vehicleNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(tr.outstanding)}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <TransporterDialog
                            transporter={tr}
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
                            onClick={() => remove(tr)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && transporters.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  No transporters yet.
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
