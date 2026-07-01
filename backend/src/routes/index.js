const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const roleRoutes = require('./roleRoutes');
const vendorRoutes = require('./vendorRoutes');
const customerRoutes = require('./customerRoutes');
const warehouseRoutes = require('./warehouseRoutes');
const productRoutes = require('./productRoutes');
const catalogRoutes = require('./catalogRoutes');
const purchaseRoutes = require('./purchaseRoutes');
const saleRoutes = require('./saleRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const financeRoutes = require('./financeRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportRoutes = require('./reportRoutes');
const settingsRoutes = require('./settingsRoutes');
const uploadRoutes = require('./uploadRoutes');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, message: 'API is healthy' }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/vendors', vendorRoutes);
router.use('/customers', customerRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/products', productRoutes);
router.use('/catalog', catalogRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/sales', saleRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/finance', financeRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingsRoutes);
router.use('/uploads', uploadRoutes);

module.exports = router;
