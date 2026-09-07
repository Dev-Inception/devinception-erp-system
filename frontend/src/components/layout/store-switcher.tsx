import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';

interface StoreRow {
  id: string;
  name: string;
  code?: string;
}

/** Header dropdown: switch between a specific store or "All Stores". Super
 * admin only — every other role is confined to the one store they were
 * created under (see the Users table on the Permissions page), so there's
 * nothing for them to switch between. Also hidden when there are no stores
 * configured yet. */
export function StoreSwitcher() {
  const role = useAuthStore((s) => s.user?.role);
  const { data: stores = [] } = useQuery<StoreRow[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: role === 'SUPER_ADMIN',
  });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const setCurrentStore = useStorefrontStore((s) => s.setCurrentStore);

  if (role !== 'SUPER_ADMIN' || stores.length === 0) return null;

  return (
    <div className="relative w-28 shrink-0 sm:w-auto">
      <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={currentStoreId ?? 'ALL'}
        onChange={(e) => setCurrentStore(e.target.value)}
        aria-label="Storefront"
        className="h-9 w-full rounded-md border border-input bg-transparent py-1 pl-8 pr-2 text-sm sm:w-auto sm:max-w-[220px]"
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
