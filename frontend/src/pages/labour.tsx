import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, HardHat, Search } from 'lucide-react';
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
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface Labour {
  id: string;
  name: string;
  phoneNumber: string;
}
const SEARCH_FETCH_LIMIT = 200;
const PAGE_SIZE = 20;

/** Create (no `editing`) or edit (with `editing`) a labour entry. */
function LabourDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Labour | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isEditing = !!editing;
  const [form, setForm] = useState({ name: '', phoneNumber: '' });
  useEffect(() => {
    if (open) setForm({ name: editing?.name ?? '', phoneNumber: editing?.phoneNumber ?? '' });
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () =>
      isEditing
        ? (await api.patch(`/labour/${editing!.id}`, form)).data
        : (await api.post('/labour', form)).data,
    onSuccess: () => {
      toast.success(isEditing ? 'Labour updated' : 'Labour created');
      qc.invalidateQueries({ queryKey: ['labour'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save labour'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Labour' : 'New Labour'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this worker’s details.' : 'Add a labourer/worker.'}
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
            <Label>Name *</Label>
            <Input
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Labour"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number *</Label>
            <Input
              required
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="e.g. 0300-1234567"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
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

export function LabourPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const role = useAuthStore((s) => s.user?.role);
  // Unlike other Partner modules, the backend gates labour create/update/delete
  // by role (super admin only) rather than a permission string.
  const canManage = role === 'SUPER_ADMIN';
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  const { data: labour = [], isLoading } = useQuery<Labour[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });

  const filtered = useMemo(
    () =>
      isSearching
        ? labour.filter(
            (l) => l.name.toLowerCase().includes(q) || l.phoneNumber.toLowerCase().includes(q),
          )
        : labour,
    [labour, isSearching, q],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Labour | null>(null);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = isSearching
    ? filtered.slice(0, fetchLimit)
    : filtered.slice((fetchPage - 1) * PAGE_SIZE, fetchPage * PAGE_SIZE);

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/labour/${id}`)).data,
    onSuccess: () => {
      toast.success('Labour deleted');
      qc.invalidateQueries({ queryKey: ['labour'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete labour'),
  });

  const remove = (l: Labour) => {
    if (window.confirm(`Delete labour "${l.name}"? This cannot be undone.`)) del.mutate(l.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search labour…')}
                className="w-72 pl-8"
              />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">{total} labour(s)</p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t('Add Labour')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Name')}</th>
              <th className="px-4 py-3 font-medium">{t('Phone Number')}</th>
              {canManage && <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              pageItems.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  onClick={() => navigate(`/labour/${l.id}`)}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      {l.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.phoneNumber}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t('Edit')}
                          onClick={() => {
                            setEditing(l);
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
                          onClick={() => remove(l)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && pageItems.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  {isSearching ? 'No labour match your search.' : 'No labour records yet.'}
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

      {dialogOpen && (
        <LabourDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
