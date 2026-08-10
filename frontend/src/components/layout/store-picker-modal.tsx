import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useStorefrontStore } from '@/store/storefront';

interface StoreRow {
  id: string;
  name: string;
  code?: string;
}

/**
 * Mandatory store selection, shown once right after a fresh login (see
 * `useStorefrontStore.markLoggedIn`, called from login.tsx) — never on a
 * plain reload. Auto-resolves and never renders when there's nothing to
 * choose (zero or one store); otherwise blocks until a specific store is
 * picked (no "All Stores" here — that's only offered afterward from the
 * header switcher).
 */
export function StorePickerModal() {
  const { data: stores = [] } = useQuery<StoreRow[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
  });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const needsSelection = useStorefrontStore((s) => s.needsSelection);
  const setCurrentStore = useStorefrontStore((s) => s.setCurrentStore);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (stores.length === 0 && currentStoreId === null) {
      setCurrentStore('ALL');
    } else if (stores.length === 1 && currentStoreId !== stores[0].id) {
      setCurrentStore(stores[0].id);
    }
  }, [stores, currentStoreId, setCurrentStore]);

  if (stores.length <= 1) return null;

  const hasResolvedSelection =
    currentStoreId === 'ALL' || (!!currentStoreId && stores.some((s) => s.id === currentStoreId));
  const open = needsSelection || !hasResolvedSelection;
  if (!open) return null;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Select a Store
          </DialogTitle>
          <DialogDescription>
            Choose which storefront you're working in. You can switch stores or view all of them
            together later from the header.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Store *</Label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Select store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ''}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={!selected} onClick={() => setCurrentStore(selected)}>
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
