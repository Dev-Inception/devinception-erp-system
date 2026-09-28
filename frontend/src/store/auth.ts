import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { http, configureAuth } from '@/lib/http';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** The role's human-typed display label (e.g. "Manager") — a custom
   *  role's `role` is its namespaced technical name and is never fit to
   *  show in the UI; this always is. Falls back to `role` if unavailable. */
  roleLabel: string;
  avatarUrl?: string;
  /** Resolved permission strings for this user's role ('*' = wildcard/super admin). */
  permissions?: string[];
  /** The one store this user is confined to. Null/undefined for super admin,
   *  who isn't restricted to a store. */
  storeId?: string | null;
  /** Every store this user administers (ADMIN role only — an owner can own
   *  more than one). Undefined/empty for everyone else. */
  storeIds?: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null; // unused: the refresh token is an httpOnly cookie
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  /** Re-fetches the current user (role, permissions, roleLabel) from the
   *  server. A role's permissions only ever change via someone else's
   *  action (Module Access) — an already-logged-in session has no other
   *  way to learn about it, since the access token isn't reissued for
   *  that. Call this on app load so a page reload (not a full re-login)
   *  is enough to pick up a permission change. */
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
  roleLabel?: string;
  avatarUrl?: string;
  permissions?: string[];
  /** Raw store id, or a populated `{ _id, name, code }` object. */
  store?: string | { _id: string } | null;
  /** Store ids this user (an ADMIN) owns — see subscriptionService. */
  adminStoreIds?: string[];
}

function mapUser(u: BackendUser): AuthUser {
  const storeId =
    typeof u.store === 'string' ? u.store : u.store && '_id' in u.store ? u.store._id : null;
  return {
    id: String(u.id ?? u._id ?? ''),
    email: u.email,
    fullName: u.name ?? u.fullName ?? u.email,
    role: String(u.role).toUpperCase() as Role,
    roleLabel: u.roleLabel ?? u.role,
    avatarUrl: u.avatarUrl,
    permissions: u.permissions,
    storeId,
    storeIds: u.adminStoreIds,
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

      // Any logged-in user can change their own password (distinct from the
      // admin-only force-reset in the Permissions screen, which skips this
      // check) — the backend verifies `currentPassword` and, on success,
      // rotates the refresh token cookie, so we swap in the fresh access
      // token here the same way `refresh()` does.
      changePassword: async (currentPassword, newPassword) => {
        const res = await http.patch('/auth/change-password', { currentPassword, newPassword });
        const { accessToken } = res.data as { accessToken: string };
        set({ accessToken });
      },

      refreshUser: async () => {
        if (!get().user) return;
        try {
          const res = await http.get('/auth/me');
          const { user } = res.data as { user: BackendUser };
          set({ user: mapUser(user) });
        } catch {
          // A transient failure here shouldn't sign anyone out — 401s are
          // already handled by the http client's own refresh/logout flow.
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
