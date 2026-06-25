import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<string | null>;
  hasRole: (...roles: Role[]) => boolean;
}

/**
 * Offline auth — there is no backend in this build. Any non-empty email/password
 * signs you in as a demo user. The role is inferred from the email's local part
 * (e.g. manager@… → MANAGER) so you can exercise role-gated UI; anything else
 * defaults to ADMIN.
 */
const DEMO_NAMES: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin User',
  MANAGER: 'Store Manager',
  CASHIER: 'POS Cashier',
  ACCOUNTANT: 'Accountant',
};

function roleFromEmail(email: string): Role {
  const local = (email.split('@')[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const known: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'ACCOUNTANT'];
  return known.find((r) => local.includes(r.replace('_', ''))) ?? 'ADMIN';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      login: async (email, _password) => {
        const role = roleFromEmail(email);
        set({
          user: { id: 'demo-user', email, fullName: DEMO_NAMES[role], role },
          accessToken: 'demo-access-token',
          refreshToken: 'demo-refresh-token',
        });
      },

      logout: () => set({ user: null, accessToken: null, refreshToken: null }),

      refresh: async () => get().accessToken,

      hasRole: (...roles) => {
        const role = get().user?.role;
        if (!role) return false;
        if (role === 'SUPER_ADMIN') return true;
        return roles.includes(role);
      },
    }),
    { name: 'devinception-auth' },
  ),
);
