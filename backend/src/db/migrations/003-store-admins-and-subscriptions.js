/**
 * Multi-store admin ownership + per-store subscriptions. Lets one ADMIN user
 * own more than one store (super admin sells stores individually, a customer
 * can buy several) while staff (manager/cashier/accountant) stay confined to
 * exactly one store, unchanged, via the existing users.store_id column.
 */
async function up(db, transaction) {
  await db.query(
    `
    -- ============================================================
    -- Which ADMIN user(s) own which store(s) — a store's "tenant admin"
    -- membership, separate from users.store_id (which still means "the one
    -- store this staff member works at"). Mirrors store_warehouses' shape.
    -- ============================================================
    CREATE TABLE store_admins (
      user_id VARCHAR(24) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, store_id)
    );
    CREATE INDEX store_admins_store_idx ON store_admins (store_id);

    -- ============================================================
    -- One manually-managed billing record per store (superadmin sells
    -- stores offline — no payment gateway integration).
    -- ============================================================
    CREATE TABLE subscriptions (
      id VARCHAR(24) PRIMARY KEY,
      store_id VARCHAR(24) NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
      owner_user_id VARCHAR(24) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
      billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly','yearly','one_time')),
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','inactive','expired','cancelled')),
      starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ends_at TIMESTAMPTZ,
      notes VARCHAR(1000) NOT NULL DEFAULT '',
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX subscriptions_owner_idx ON subscriptions (owner_user_id);
    CREATE INDEX subscriptions_status_idx ON subscriptions (status);
  `,
    { transaction },
  );
}

module.exports = { name: '003-store-admins-and-subscriptions', up };
