import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, Tags, Search } from 'lucide-react';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { Pagination } from '@/components/ui/pagination';
import { useLanguage } from '@/components/language-provider';

interface Category {
  id: string;
  name: string;
  description?: string;
}
const SEARCH_FETCH_LIMIT = 200;
const PAGE_SIZE = 20;

/** Create (no `editing`) or edit (with `editing`) a category. */
function CategoryDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Category | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isEditing = !!editing;
  const [form, setForm] = useState({ name: '', description: '' });

  useEffect(() => {
    if (open) setForm({ name: editing?.name ?? '', description: editing?.description ?? '' });
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () =>
      isEditing
        ? (await api.patch(`/categories/${editing!.id}`, form)).data
        : (await api.post('/categories', form)).data,
    onSuccess: () => {
      toast.success(isEditing ? 'Category updated' : 'Category created');
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save category'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Category' : 'New Category'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this product category.' : 'Add a category to classify products.'}
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
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Beverages"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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

export function CategoriesPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const perms = useAuthStore((s) => s.user?.permissions);
  // Category create/update/delete all require inventory:manage on the backend.
  const canManage = grantsPermission(perms, 'inventory:manage');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const filtered = useMemo(
    () =>
      isSearching
        ? categories.filter(
            (c) =>
              c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
          )
        : categories,
    [categories, isSearching, q],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = isSearching
    ? filtered.slice(0, fetchLimit)
    : filtered.slice((fetchPage - 1) * PAGE_SIZE, fetchPage * PAGE_SIZE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/categories/${id}`)).data,
    onSuccess: () => {
      toast.success('Category deleted');
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete category'),
  });

  const remove = (c: Category) => {
    if (window.confirm(`Delete category "${c.name}"? This cannot be undone.`)) del.mutate(c.id);
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
                placeholder={t('Search categories…')}
                className="w-72 pl-8"
              />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            {total} categor{total === 1 ? 'y' : 'ies'}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t('Add Category')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Name')}</th>
                <th className="px-4 py-3 font-medium">{t('Description')}</th>
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
                pageItems.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-muted-foreground" />
                        {c.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.description || '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Edit')}
                            onClick={() => {
                              setEditing(c);
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
                            onClick={() => remove(c)}
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
                    {isSearching ? 'No categories match your search.' : 'No categories yet.'}
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

      {dialogOpen && (
        <CategoryDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
