const { param, query } = require('express-validator');

const REPORT_TYPES = ['sales', 'purchases', 'stock-valuation', 'profit-loss', 'day-book'];
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
  query('warehouse')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid warehouse'),
  query('store')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid store'),
];

module.exports = { REPORT_TYPES, reportRequestValidator };
