import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, HardHat } from 'lucide-react';
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

interface Labour {
  id: string;
  name: string;
  phoneNumber: string;
}

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
              placeholder="e.g. Imran Khan"
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
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LabourPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  // Unlike other Partner modules, the backend gates labour create/update/delete
  // by role (super admin only) rather than a permission string.
  const canManage = role === 'SUPER_ADMIN';

  const { data: labour = [], isLoading } = useQuery<Labour[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Labour | null>(null);

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{labour.length} labour(s)</p>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Labour
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone Number</th>
              {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
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
              labour.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      {l.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.phoneNumber}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Edit"
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
                          title="Delete"
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
            {!isLoading && labour.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  No labour records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
