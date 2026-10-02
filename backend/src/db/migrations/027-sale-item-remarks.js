/**
 * A free-text remark per sale line, entered next to the product on the POS
 * (e.g. colour, size, fitting notes for that item).
 */
async function up(db, transaction) {
  await db.query(`ALTER TABLE sale_items ADD COLUMN remarks VARCHAR(255) NOT NULL DEFAULT '';`, {
    transaction,
  });
}

module.exports = { name: '027-sale-item-remarks', up };
