import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

/** Records a Cash In / Cash Out against the store's till. Opened from the
 * Day Book; the entry lands on the header's working date like any other. */
export function CashEntryDialog() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'CASH_IN', amount: 0, description: '' });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  // A cash entry always affects one physical store's till — "All Stores"
  // isn't a real drawer it can be recorded against.
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const create = useMutation({
    mutationFn: async () => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a cash entry.');
      }
      return (await api.post('/cash', { ...form, storeId: currentStoreId })).data;
    },
    onSuccess: () => {
      toast.success('Recorded');
      qc.invalidateQueries({ queryKey: ['cash'] });
      setForm({ type: 'CASH_IN', amount: 0, description: '' });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Failed'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t('Cash entry')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cash Entry</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {!hasSpecificStore && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select a specific store from the header first.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(['CASH_IN', 'CASH_OUT'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.type === t ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, type: t })}
              >
                {t === 'CASH_IN' ? 'Cash In' : 'Cash Out'}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
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
            <Button type="submit" disabled={create.isPending || !hasSpecificStore}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
