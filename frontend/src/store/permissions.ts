import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from './auth';
import { MODULES, ROLES, defaultModulesForRole } from '@/lib/modules';

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

/** role → the module keys that role is allowed to see. */
export type ModuleAccess = Record<Role, string[]>;

function defaultAccess(): ModuleAccess {
  return ROLES.reduce((acc, role) => {
    acc[role] = defaultModulesForRole(role);
    return acc;
  }, {} as ModuleAccess);
}

const SEED_USERS: ManagedUser[] = [
  {
    id: 'seed-super-admin',
    fullName: 'Super Admin',
    email: 'superadmin@devinception.com',
    role: 'SUPER_ADMIN',
    active: true,
    createdAt: '2026-01-01',
  },
];

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `user-${Math.random().toString(36).slice(2)}`;
}

export interface NewUserInput {
  fullName: string;
  email: string;
  role: Role;
  active?: boolean;
}

interface PermissionsState {
  users: ManagedUser[];
  access: ModuleAccess;

  addUser: (input: NewUserInput) => void;
  updateUser: (id: string, patch: Partial<Omit<ManagedUser, 'id' | 'createdAt'>>) => void;
  removeUser: (id: string) => void;

  /** Flip a single module on/off for a role. */
  toggleModule: (role: Role, moduleKey: string) => void;
  /** Replace the full module set for a role. */
  setRoleModules: (role: Role, keys: string[]) => void;
  /** Restore every role's access to the shipped defaults. */
  resetAccess: () => void;

  /** Whether a role may see a module. SUPER_ADMIN always may. */
  canAccess: (role: Role | undefined, moduleKey: string) => boolean;
}

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set, get) => ({
      users: SEED_USERS,
      access: defaultAccess(),

      addUser: (input) =>
        set((s) => ({
          users: [
            ...s.users,
            {
              id: newId(),
              fullName: input.fullName.trim(),
              email: input.email.trim().toLowerCase(),
              role: input.role,
              active: input.active ?? true,
              createdAt: new Date().toISOString().slice(0, 10),
            },
          ],
        })),

      updateUser: (id, patch) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        })),

      removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

      toggleModule: (role, moduleKey) =>
        set((s) => {
          const current = s.access[role] ?? [];
          const next = current.includes(moduleKey)
            ? current.filter((k) => k !== moduleKey)
            : [...current, moduleKey];
          return { access: { ...s.access, [role]: next } };
        }),

      setRoleModules: (role, keys) => set((s) => ({ access: { ...s.access, [role]: keys } })),

      resetAccess: () => set({ access: defaultAccess() }),

      canAccess: (role, moduleKey) => {
        if (!role) return false;
        if (role === 'SUPER_ADMIN') return true;
        return (get().access[role] ?? []).includes(moduleKey);
      },
    }),
    {
      name: 'devinception-permissions',
      version: 1,
      /**
       * Heal persisted state when the module catalog changes: drop access entries
       * for modules that no longer exist and guarantee every role has a key set.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PermissionsState>;
        const validKeys = new Set(MODULES.map((m) => m.key));
        const fallback = defaultAccess();
        const access = ROLES.reduce((acc, role) => {
          const savedKeys = saved.access?.[role];
          acc[role] = savedKeys ? savedKeys.filter((k) => validKeys.has(k)) : fallback[role];
          return acc;
        }, {} as ModuleAccess);
        return { ...current, ...saved, access };
      },
    },
  ),
);
