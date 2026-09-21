/**
 * POS labour lines now record which billable service (from labour_services)
 * a labourer is being paid for on this sale, instead of one flat rent per
 * labourer — a labourer can appear more than once on the same sale, once per
 * service, each with its own amount. `service_name` snapshots the service's
 * name at sale time, same as `sale_labour.name`/`phone_number` already do
 * for the labourer.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE sale_labour ADD COLUMN service_id VARCHAR(24) REFERENCES labour_services(id) ON DELETE SET NULL;
    ALTER TABLE sale_labour ADD COLUMN service_name VARCHAR(80) NOT NULL DEFAULT '';
  `,
    { transaction },
  );
}

module.exports = { name: '021-sale-labour-services', up };
