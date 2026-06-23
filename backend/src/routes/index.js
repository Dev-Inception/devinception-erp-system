const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const roleRoutes = require("./roleRoutes");

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ success: true, message: "API is healthy" })
);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);

module.exports = router;
