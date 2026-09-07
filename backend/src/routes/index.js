const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const roleRoutes = require('./roleRoutes');
const vendorRoutes = require('./vendorRoutes');
const supplierRoutes = require('./supplierRoutes');
const transporterRoutes = require('./transporterRoutes');
const customerRoutes = require('./customerRoutes');
const warehouseRoutes = require('./warehouseRoutes');
const storeRoutes = require('./storeRoutes');
const productRoutes = require('./productRoutes');
const catalogRoutes = require('./catalogRoutes');
const stockReceiptRoutes = require('./stockReceiptRoutes');
const saleRoutes = require('./saleRoutes');
const saleDraftRoutes = require('./saleDraftRoutes');
const estimateRoutes = require('./estimateRoutes');
const expenseRoutes = require('./expenseRoutes');
const financeRoutes = require('./financeRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportRoutes = require('./reportRoutes');
const settingsRoutes = require('./settingsRoutes');
const uploadRoutes = require('./uploadRoutes');
const labourRoutes = require('./labourRoutes');
const pendingEntityRoutes = require('./pendingEntityRoutes');
const gatePassRoutes = require('./gatePassRoutes');
const gatePassPublicRoutes = require('./gatePassPublicRoutes');
const dayEndRoutes = require('./dayEndRoutes');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, message: 'API is healthy' }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/vendors', vendorRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/transporters', transporterRoutes);
router.use('/customers', customerRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/catalog', catalogRoutes);
router.use('/stock-receipts', stockReceiptRoutes);
router.use('/sales', saleRoutes);
router.use('/sale-drafts', saleDraftRoutes);
router.use('/estimates', estimateRoutes);
router.use('/expenses', expenseRoutes);
router.use('/finance', financeRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/labour', labourRoutes);
router.use('/pending-entities', pendingEntityRoutes);
router.use('/day-end', dayEndRoutes);
// Must be registered before the protected `/gate-passes` mount below —
// otherwise its `protect` middleware would intercept these paths first.
router.use('/gate-passes/public', gatePassPublicRoutes);
router.use('/gate-passes', gatePassRoutes);

module.exports = router;
