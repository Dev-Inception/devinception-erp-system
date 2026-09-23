/**
 * Seed the starter expense-category list. Unlike product categories/brands/
 * units, expense categories aren't store-scoped (see expenseCategoryModel) —
 * one global list is shared by every store. Idempotent: each entry is
 * created only if a same-name one doesn't already exist (case-insensitive).
 *
 *   node src/scripts/seedExpenseCategories.js
 */
const connectDB = require('../config/db');
const expenseService = require('../services/expenseService');

const EXPENSE_CATEGORIES = [
  'Hardware Purchase',
  'Tea',
  'Food Expense Paid',
  'Guest Refreshment',
  'Water Refill',
  'Sanitary Items(Cleaning Items, Tissue etc.)',
  'Charity Paid',
];

async function seed() {
  const db = await connectDB();

  for (const name of EXPENSE_CATEGORIES) {
    await expenseService.createCategory(name);
  }

  // eslint-disable-next-line no-console
  console.log(`Expense categories seeded: ${EXPENSE_CATEGORIES.length}`);

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
