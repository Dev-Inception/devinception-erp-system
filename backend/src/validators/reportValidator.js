const { param, query } = require('express-validator');

const REPORT_TYPES = ['sales', 'purchases', 'stock-valuation', 'profit-loss'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const reportRequestValidator = [
  param('type').isIn(REPORT_TYPES).withMessage('Invalid report type'),
  query('from')
    .optional({ values: 'falsy' })
    .matches(DATE_PATTERN)
    .withMessage("'from' must use YYYY-MM-DD"),
  query('to')
    .optional({ values: 'falsy' })
    .matches(DATE_PATTERN)
    .withMessage("'to' must use YYYY-MM-DD"),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
];

module.exports = { REPORT_TYPES, reportRequestValidator };
