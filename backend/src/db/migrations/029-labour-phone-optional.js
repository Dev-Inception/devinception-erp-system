/**
 * A labourer can be added with just a name (e.g. straight from the expense
 * form) — the phone number becomes optional. Blank phones are stored as ''
 * and are exempt from the per-store unique phone index.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE labour ALTER COLUMN phone_number SET DEFAULT '';
    DROP INDEX labour_store_phone_unique;
    CREATE UNIQUE INDEX labour_store_phone_unique
      ON labour (store_id, phone_number) WHERE phone_number <> '';
  `,
    { transaction },
  );
}

module.exports = { name: '029-labour-phone-optional', up };
