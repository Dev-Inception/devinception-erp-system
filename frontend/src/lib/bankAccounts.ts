import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface BankAccountOption {
  id: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  storeId?: string;
  isActive: boolean;
  balance?: string | number;
}

/**
 * Bank accounts scoped to one store — every payment method picker that
 * offers "bank/online" needs this, since a store only ever settles into its
 * own accounts. `storeId` undefined/empty returns every account (used for
 * the "All Stores" view), matching how the rest of the app degrades store
 * filters to "everything" when no specific store is selected.
 */
export function useBankAccounts(storeId: string | undefined, enabled = true) {
  return useQuery<BankAccountOption[]>({
    queryKey: ['bank-accounts', storeId ?? null],
    queryFn: async () =>
      (await api.get('/bank/accounts', { params: storeId ? { store: storeId } : undefined })).data,
    enabled,
  });
}
