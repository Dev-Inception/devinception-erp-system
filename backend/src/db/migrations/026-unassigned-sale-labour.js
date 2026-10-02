/**
 * Lets a POS sale charge for labour services without naming the labourer —
 * the crew on a job often isn't settled when the sale is rung up. A sale
 * labour line can now carry just a service, its amount and an optional
 * contact number: sale_labour.labour_id becomes nullable (name stays '' for
 * such lines). Nothing is owed to anyone for those lines at checkout; the
 * actual labour payout is recorded separately.
 */
async function up(db, transaction) {
  await db.query(`ALTER TABLE sale_labour ALTER COLUMN labour_id DROP NOT NULL;`, {
    transaction,
  });
}

module.exports = { name: '026-unassigned-sale-labour', up };
