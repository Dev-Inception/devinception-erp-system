const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineSettings(db) {
  return defineModel(
    db,
    'Settings',
    {
      id: id(),
      key: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'app' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      companyName: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      phone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      taxNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PKR' },
      invoiceNote: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
      logoUrl: { type: DataTypes.TEXT, allowNull: true },
      facebook: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      instagram: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      gmail: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      tiktok: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      website: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      smtpHost: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      smtpPort: { type: DataTypes.INTEGER, allowNull: true },
      smtpUser: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      smtpPass: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      smtpFrom: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      // Meta WhatsApp Cloud API — see db/migrations/025-meta-whatsapp.js.
      whatsappPhoneNumberId: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      whatsappAccessToken: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
      whatsappTemplateName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      whatsappTemplateLanguage: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      // How labour charged on a POS sale is paid out — see
      // db/migrations/024-labour-pricing-mode.js.
      labourPricingMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'DIRECT',
        validate: { isIn: [['DIRECT', 'PENDING']] },
      },
    },
    { tableName: 'settings' },
  );
};
