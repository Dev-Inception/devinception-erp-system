import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { configureWorkingDate } from '@/lib/http';
import { useAuthStore } from './auth';
import { useStorefrontStore } from './storefront';

interface WorkingDateState {
  /** The past business date a super admin / store admin picked in the
   * header, or null to follow the store's live business day. Deliberately
   * not persisted: a reload always lands back on the live day, so nobody
   * keeps posting into an old date by accident. */
  workingDate: string | null;
  setWorkingDate: (date: string | null) => void;
}

export const useWorkingDateStore = create<WorkingDateState>()((set) => ({
  workingDate: null,
  setWorkingDate: (workingDate) => set({ workingDate }),
}));

/** Only a super admin or a store admin can work on a date other than the
 * live business day (the backend ignores the header for anyone else). */
export function canPickWorkingDate(role?: string | null) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

// Local calendar date ('YYYY-MM-DD'), not toISOString() (which is UTC).
export function localDateStr(d: Date = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The date new entries should default to in forms — the header's working
 * date when one is picked, otherwise today. */
export function useEntryDate() {
  const workingDate = useWorkingDateStore((s) => s.workingDate);
  return workingDate ?? localDateStr();
}

/** The working date (and the store it was picked for) to send with the
 * current request, if any — the backend only lets it land entries on a past
 * day that an admin has reopened. */
export function workingDateHeader(): { date: string; store: string } | null {
  const { workingDate } = useWorkingDateStore.getState();
  const store = useStorefrontStore.getState().currentStoreId;
  if (!workingDate || !store || store === 'ALL') return null;
  if (!canPickWorkingDate(useAuthStore.getState().user?.role)) return null;
  return { date: workingDate, store };
}

// Injected rather than imported by the http client, mirroring configureAuth,
// so lib/http stays free of store imports.
configureWorkingDate(workingDateHeader);

/** The date the header shows: the picked working date, else the store's
 * live business day (which stays on an open day past midnight), else today.
 * Pages that show figures "for the day" follow this. Shares its cache key
 * with the header's DayControl, so it costs no extra request. */
export function useHeaderDate() {
  const workingDate = useWorkingDateStore((s) => s.workingDate);
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const { data: live } = useQuery<{ businessDate?: string }>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
  });
  return workingDate ?? live?.businessDate ?? localDateStr();
}
