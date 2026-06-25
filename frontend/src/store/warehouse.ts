import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WarehouseState {
  /** The warehouse the current session is operating in (POS sells from / GP receives into). */
  currentId: string | null;
  setCurrent: (id: string) => void;
}

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set) => ({
      currentId: null,
      setCurrent: (id) => set({ currentId: id }),
    }),
    { name: 'devinception-warehouse' },
  ),
);
