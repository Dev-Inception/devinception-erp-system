const { body, query } = require('express-validator');

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const statusQueryValidator = [
  query('store').isMongoId().withMessage('A valid store is required'),
  query('date').matches(CALENDAR_DATE).withMessage('date must be in YYYY-MM-DD format'),
];

const openDayValidator = [body('store').isMongoId().withMessage('A valid store is required')];

const closeDayValidator = [
  body('store').isMongoId().withMessage('A valid store is required'),
  body('handoverAmount').isFloat({ min: 0 }).withMessage('A valid amount to submit is required'),
];

const reopenDayValidator = [body('store').isMongoId().withMessage('A valid store is required')];

module.exports = {
  statusQueryValidator,
  openDayValidator,
  closeDayValidator,
  reopenDayValidator,
};
