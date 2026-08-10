import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useStorefrontStore } from '@/store/storefront';

interface StoreRow {
  id: string;
  name: string;
  code?: string;
}

/** Header dropdown: switch between a specific store or "All Stores". Hidden
 * entirely when there are no stores configured yet. */
export function StoreSwitcher() {
  const { data: stores = [] } = useQuery<StoreRow[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
  });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const setCurrentStore = useStorefrontStore((s) => s.setCurrentStore);

  if (stores.length === 0) return null;

  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={currentStoreId ?? 'ALL'}
        onChange={(e) => setCurrentStore(e.target.value)}
        aria-label="Storefront"
        className="h-9 rounded-md border border-input bg-transparent py-1 pl-8 pr-2 text-sm"
      >
        <option value="ALL">All Stores</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.code ? ` (${s.code})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
