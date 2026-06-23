const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");

const routes = require("./routes");
const swaggerSpec = require("./config/swagger");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");
const env = require("./config/env");

const app = express();

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);

// Interactive API docs
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "POS API Docs",
    swaggerOptions: { persistAuthorization: true },
  })
);
// Raw spec for tooling / import into Postman
app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

// API routes
app.use("/api", routes);

// 404 + centralized error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
