import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StorefrontState {
  /** The store the header switcher / mandatory picker has resolved to. `'ALL'`
   * means "every store"; `null` means nothing has been decided yet. */
  currentStoreId: string | 'ALL' | null;
  /** True right after a fresh login, until a specific store is chosen — this
   * is what makes the mandatory picker show once per login rather than on
   * every reload (it is deliberately excluded from persistence below). */
  needsSelection: boolean;
  setCurrentStore: (id: string | 'ALL') => void;
  markLoggedIn: () => void;
}

export const useStorefrontStore = create<StorefrontState>()(
  persist(
    (set) => ({
      currentStoreId: null,
      needsSelection: false,
      setCurrentStore: (id) => set({ currentStoreId: id, needsSelection: false }),
      markLoggedIn: () => set({ needsSelection: true }),
    }),
    {
      name: 'devinception-storefront',
      partialize: (s) => ({ currentStoreId: s.currentStoreId }),
    },
  ),
);

/** The `store` query param for the current storefront selection — `{}` under
 * "All Stores" (or before anything's been picked), so it drops out of the
 * request entirely rather than filtering to nothing. */
export function useStorefrontFilter(): { store?: string } {
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  return currentStoreId && currentStoreId !== 'ALL' ? { store: currentStoreId } : {};
}
