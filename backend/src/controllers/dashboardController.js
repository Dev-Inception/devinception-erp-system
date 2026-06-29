const dashboardService = require("../services/dashboardService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");
const { view } = require("../utils/money");

const CARD_MONEY = [
  "todaySales",
  "monthSales",
  "totalRevenue",
  "stockValue",
  "expenses",
  "receivables",
  "payables",
];

// Paisa -> rupees across the whole payload (cards, trend points, top products).
function serialize(data) {
  return {
    cards: view(data.cards, CARD_MONEY),
    salesTrend: data.salesTrend.map((p) => view(p, ["total"])),
    topProducts: data.topProducts.map((p) => view(p, ["revenue"])),
  };
}

// GET /api/dashboard?warehouse=
const getSummary = asyncHandler(async (req, res) => {
  const { warehouse } = req.query;
  const data = await dashboardService.summary({ warehouse });
  return sendSuccess(res, 200, "Dashboard summary", serialize(data));
});

module.exports = { getSummary };
