const { body, query } = require('express-validator');

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const statusQueryValidator = [
  query('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid store is required'),
  query('date').matches(CALENDAR_DATE).withMessage('date must be in YYYY-MM-DD format'),
];

const closeDayValidator = [
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid store is required'),
  body('date').matches(CALENDAR_DATE).withMessage('date must be in YYYY-MM-DD format'),
];

const reopenDayValidator = closeDayValidator;

module.exports = { statusQueryValidator, closeDayValidator, reopenDayValidator };
