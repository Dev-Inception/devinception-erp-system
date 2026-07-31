import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { http, configureAuth } from '@/lib/http';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl?: string;
  /** Resolved permission strings for this user's role ('*' = wildcard/super admin). */
  permissions?: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null; // unused: the refresh token is an httpOnly cookie
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  hasRole: (...roles: Role[]) => boolean;
}

/**
 * Map the backend user document to the shape the UI expects:
 *  - `name` → `fullName`
 *  - role is upper-cased (`super_admin` → `SUPER_ADMIN`)
 *  - `_id`/`id` → `id`
 */
interface BackendUser {
  id?: string;
  _id?: string;
  email: string;
  name?: string;
  fullName?: string;
  role: string;
  avatarUrl?: string;
  permissions?: string[];
}

function mapUser(u: BackendUser): AuthUser {
  return {
    id: String(u.id ?? u._id ?? ''),
    email: u.email,
    fullName: u.name ?? u.fullName ?? u.email,
    role: String(u.role).toUpperCase() as Role,
    avatarUrl: u.avatarUrl,
    permissions: u.permissions,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      login: async (email, password) => {
        // `skipAuthRefresh` so a 401 here surfaces as "invalid credentials"
        // instead of trying to refresh.
        const res = await http.post('/auth/login', { email, password }, { skipAuthRefresh: true });
        const { user, accessToken } = res.data as { user: BackendUser; accessToken: string };
        set({ user: mapUser(user), accessToken, refreshToken: null });
      },

      logout: async () => {
        // Clear local/persisted state first so this tab and other open tabs stop
        // offering protected actions while the backend invalidates the JWTs.
        const token = get().accessToken;
        const request = http.post(
          '/auth/logout',
          {},
          {
            skipAuthRefresh: true,
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          },
        );
        set({ user: null, accessToken: null, refreshToken: null });
        try {
          await request;
        } catch {
          // The local session must still close if the server is unavailable.
        }
      },

      refresh: async () => {
        if (!get().user) return null;
        try {
          const res = await http.post('/auth/refresh', {}, { skipAuthRefresh: true });
          const { accessToken } = res.data as { accessToken: string };
          set({ accessToken });
          return accessToken;
        } catch {
          set({ user: null, accessToken: null, refreshToken: null });
          return null;
        }
      },

      hasRole: (...roles) => {
        const role = get().user?.role;
        if (!role) return false;
        if (role === 'SUPER_ADMIN') return true;
        return roles.includes(role);
      },
    }),
    {
      name: 'devinception-auth',
      // Never persist the refresh token (it lives in an httpOnly cookie).
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
    },
  ),
);

/**
 * Wire the HTTP client to this store: read the live access token, refresh via the
 * store on 401, and log out if refresh fails.
 */
configureAuth({
  getToken: () => useAuthStore.getState().accessToken,
  refreshToken: () => useAuthStore.getState().refresh(),
  onAuthFailure: () => useAuthStore.getState().logout(),
});

// Zustand persistence does not automatically update an already-open tab when
// another tab logs out. Mirror logout events so a QR tab cannot retain a stale
// in-memory access token after logout elsewhere in the ERP.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== 'devinception-auth') return;
    try {
      const persisted = event.newValue ? JSON.parse(event.newValue) : null;
      if (!persisted?.state?.user) {
        useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
      }
    } catch {
      useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
    }
  });
}
