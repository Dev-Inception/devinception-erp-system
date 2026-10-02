const { createId } = require('../id');

/**
 * Labour and transport are paid out from Expenses, against the sale invoice
 * the work was for:
 *  - expense_categories.system_key marks the two built-in categories
 *    ('LABOUR', 'TRANSPORT') that must always exist. An existing category
 *    with a matching name is adopted rather than duplicated.
 *  - expenses gain the sale they pay for (sale_id + snapshotted sale_no)
 *    and who was paid (labour_id or transporter_id + snapshotted
 *    payee_name). All nullable — ordinary expenses carry none of them.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE expense_categories ADD COLUMN system_key VARCHAR(20);
    CREATE UNIQUE INDEX expense_categories_system_key_unique
      ON expense_categories (system_key) WHERE system_key IS NOT NULL;

    ALTER TABLE expenses ADD COLUMN sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE RESTRICT;
    ALTER TABLE expenses ADD COLUMN sale_no VARCHAR(40) NOT NULL DEFAULT '';
    ALTER TABLE expenses ADD COLUMN labour_id VARCHAR(24) REFERENCES labour(id) ON DELETE RESTRICT;
    ALTER TABLE expenses ADD COLUMN transporter_id VARCHAR(24)
      REFERENCES transporters(id) ON DELETE RESTRICT;
    ALTER TABLE expenses ADD COLUMN payee_name VARCHAR(120) NOT NULL DEFAULT '';
    CREATE INDEX expenses_sale_idx ON expenses (sale_id);
    CREATE INDEX expenses_labour_idx ON expenses (labour_id);
    CREATE INDEX expenses_transporter_idx ON expenses (transporter_id);
  `,
    { transaction },
  );

  const builtIns = [
    { key: 'LABOUR', name: 'Labour', aliases: ['labour', 'labor'] },
    { key: 'TRANSPORT', name: 'Transport', aliases: ['transport', 'transportation'] },
  ];
  for (const b of builtIns) {
    const [rows] = await db.query(
      `UPDATE expense_categories SET system_key = :key, is_active = true
       WHERE id = (SELECT id FROM expense_categories WHERE LOWER(name) IN (:aliases)
                   ORDER BY created_at LIMIT 1)
       RETURNING id`,
      { replacements: { key: b.key, aliases: b.aliases }, transaction },
    );
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO expense_categories (id, name, description, system_key)
         VALUES (:id, :name, :description, :key)`,
        {
          replacements: {
            id: createId(),
            name: b.name,
            description: `Built-in: pay ${b.name.toLowerCase()} against a sale invoice`,
            key: b.key,
          },
          transaction,
        },
      );
    }
  }
}

module.exports = { name: '028-labour-transport-expenses', up };
