/**
 * Adds branding fields to `settings`: a logo (base64 data URL, same
 * convention as `products.image` — see 003/a83ee87) and social/contact
 * links (Facebook, Instagram, Gmail, TikTok, website), so the Company
 * settings form can show/edit them alongside the existing identity fields.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE settings ADD COLUMN logo_url TEXT;
    ALTER TABLE settings ADD COLUMN facebook VARCHAR(300) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN instagram VARCHAR(300) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN gmail VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN tiktok VARCHAR(300) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN website VARCHAR(300) NOT NULL DEFAULT '';
  `,
    { transaction },
  );
}

module.exports = { name: '011-settings-branding', up };
