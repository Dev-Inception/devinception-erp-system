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
      twilioAccountSid: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      twilioAuthToken: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      // Explicit `field` because Sequelize's `underscored` auto-conversion
      // would otherwise split "WhatsApp" into "whats_app".
      twilioWhatsAppFrom: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: '',
        field: 'twilio_whatsapp_from',
      },
    },
    { tableName: 'settings' },
  );
};
