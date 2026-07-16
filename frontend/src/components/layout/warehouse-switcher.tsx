import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
