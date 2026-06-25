import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { useWarehouseStore } from '@/store/warehouse';

export interface WarehouseRow {
  id: string;
  name: string;
  location?: string;
  isDefault: boolean;
  itemCount: number;
  stockValue: number;
}

/** Fetches warehouses once and keeps a sensible current selection. */
export function useWarehouses() {
  const { currentId, setCurrent } = useWarehouseStore();
  const query = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
  });

  useEffect(() => {
    const list = query.data;
    if (!list?.length) return;
    // Pick the default (or first) when nothing is selected or the selection vanished.
    if (!currentId || !list.some((w) => w.id === currentId)) {
      setCurrent((list.find((w) => w.isDefault) ?? list[0]).id);
    }
  }, [query.data, currentId, setCurrent]);

  return { warehouses: query.data ?? [], currentId };
}

export function WarehouseSwitcher() {
  const { setCurrent } = useWarehouseStore();
  const { warehouses, currentId } = useWarehouses();

  if (warehouses.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <Warehouse className="h-4 w-4 text-muted-foreground" />
      <select
        value={currentId ?? ''}
        onChange={(e) => setCurrent(e.target.value)}
        className="bg-transparent text-sm font-medium focus-visible:outline-none"
        aria-label="Active warehouse"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
