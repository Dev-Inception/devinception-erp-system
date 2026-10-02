const { body, query } = require('express-validator');

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const statusQueryValidator = [
  query('store').isMongoId().withMessage('A valid store is required'),
  // Omit `date` for the store's live state (see dayEndService.getStatus).
  query('date')
    .optional({ values: 'falsy' })
    .matches(CALENDAR_DATE)
    .withMessage('date must be in YYYY-MM-DD format'),
];

const openDayValidator = [
  body('store').isMongoId().withMessage('A valid store is required'),
  // Only today can be opened (see dayEndService.openDay).
  body('date')
    .optional({ values: 'falsy' })
    .matches(CALENDAR_DATE)
    .withMessage('date must be in YYYY-MM-DD format'),
];

const optionalDate = () =>
  body('date')
    .optional({ values: 'falsy' })
    .matches(CALENDAR_DATE)
    .withMessage('date must be in YYYY-MM-DD format');

const closeDayValidator = [
  body('store').isMongoId().withMessage('A valid store is required'),
  // A past day an admin reopened; omit for the live day.
  optionalDate(),
  body('handoverAmount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('The amount submitted must be zero or more'),
];

const reopenDayValidator = [
  body('store').isMongoId().withMessage('A valid store is required'),
  // A past date to reopen for editing; omit for the live (latest) day.
  optionalDate(),
];

module.exports = {
  statusQueryValidator,
  openDayValidator,
  closeDayValidator,
  reopenDayValidator,
};
