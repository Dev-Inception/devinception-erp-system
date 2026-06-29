const dotenv = require("dotenv");

dotenv.config();

/**
 * Centralized, validated environment config.
 * Import this instead of reading process.env directly so a missing
 * variable fails fast at startup rather than deep inside a request.
 */
const required = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",

  mongoUri: process.env.MONGO_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  resetTokenExpiresMin: parseInt(process.env.RESET_TOKEN_EXPIRES_MIN, 10) || 15,

  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 2525,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "Point of Sale <no-reply@devinception.com>",
  },

  company: {
    name: process.env.COMPANY_NAME || "DevInception",
    address: process.env.COMPANY_ADDRESS || "",
    phone: process.env.COMPANY_PHONE || "",
  },

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || "Super Admin",
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
};

module.exports = env;
