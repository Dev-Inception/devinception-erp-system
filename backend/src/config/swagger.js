const env = require("./env");
const { PERMISSION_VALUES } = require("../utils/permissions");

/**
 * OpenAPI 3 specification for the POS auth API. Served via swagger-ui at
 * /api/docs. Kept as a single hand-written spec so request bodies, auth
 * schemes and response shapes stay accurate and in one place.
 */

// Reusable response envelope helpers.
const successData = (properties) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    data: { type: "object", properties: properties },
  },
});

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          errors: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Field-keyed validation messages (when applicable)",
          },
        },
      },
    },
  },
};

const userSchema = {
  type: "object",
  properties: {
    _id: { type: "string", example: "6a398f83d9b8a761a28ae4b6" },
    name: { type: "string", example: "Super Admin" },
    email: { type: "string", example: "superadmin@devinception.com" },
    role: {
      type: "string",
      example: "super_admin",
      description: "Name of an existing role (built-in or custom)",
    },
    isActive: { type: "boolean", example: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const roleSchema = {
  type: "object",
  properties: {
    _id: { type: "string", example: "6a398f83d9b8a761a28ae4c1" },
    name: { type: "string", example: "supervisor" },
    description: { type: "string", example: "Shift supervisor" },
    permissions: {
      type: "array",
      items: { type: "string", enum: PERMISSION_VALUES },
      example: ["users:read"],
    },
    isSystem: {
      type: "boolean",
      example: false,
      description: "Built-in roles (true) cannot be renamed or deleted",
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const authTokenResponse = {
  description: "Success",
  content: {
    "application/json": {
      schema: successData({
        user: userSchema,
        accessToken: { type: "string" },
      }),
    },
  },
};

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Point of Sale — Auth & RBAC API",
    version: "1.0.0",
    description:
      "JWT authentication with role-based access control. " +
      "Click **Authorize**, paste an access token from /auth/login, then try the protected endpoints.",
  },
  servers: [{ url: `http://localhost:${env.port}/api`, description: "Local" }],
  tags: [
    { name: "Auth", description: "Registration, login, password reset" },
    { name: "Users", description: "Admin user management (RBAC protected)" },
    { name: "Roles", description: "Role & permission management (super_admin only)" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the accessToken returned by /auth/login",
      },
    },
    schemas: { User: userSchema, Role: roleSchema },
  },
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and receive an access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "superadmin@devinception.com" },
                  password: { type: "string", example: "ChangeMe123!" },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse, 401: errorResponse },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Exchange the refresh-token cookie for a new access token",
        description:
          "Reads the httpOnly refreshToken cookie (set at login) or a refreshToken in the body.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "New access token",
            content: {
              "application/json": {
                schema: successData({ accessToken: { type: "string" } }),
              },
            },
          },
          401: errorResponse,
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Clear the refresh-token cookie",
        responses: { 200: { description: "Logged out" } },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password-reset link",
        description:
          "Always returns 200. Without SMTP configured the reset link is printed to the server console.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", example: "jane@devinception.com" } },
              },
            },
          },
        },
        responses: { 200: { description: "Generic acknowledgement" }, 400: errorResponse },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Set a new password using the emailed token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string", description: "Raw token from the reset link" },
                  password: { type: "string", example: "NewPassw0rd123" },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Current user",
            content: {
              "application/json": { schema: successData({ user: userSchema }) },
            },
          },
          401: errorResponse,
        },
      },
    },
    "/auth/change-password": {
      patch: {
        tags: ["Auth"],
        summary: "Change password while logged in",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string", example: "ChangeMe123!" },
                  newPassword: { type: "string", example: "NewPassw0rd123" },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse, 401: errorResponse },
      },
    },
    "/users": {
      get: {
        tags: ["Users"],
        summary: "List users (manager and above)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "role", in: "query", schema: { type: "string" }, description: "Filter by role name" },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Paginated users",
            content: {
              "application/json": {
                schema: successData({
                  users: { type: "array", items: userSchema },
                  total: { type: "integer" },
                  page: { type: "integer" },
                  limit: { type: "integer" },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a user with an explicit role (admin and above)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password", "role"],
                properties: {
                  name: { type: "string", example: "Mark Manager" },
                  email: { type: "string", example: "mark@devinception.com" },
                  password: { type: "string", example: "Passw0rd123" },
                  role: { type: "string", example: "manager", description: "Any existing role name" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created user",
            content: { "application/json": { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    "/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get a user by id (manager and above)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "User",
            content: { "application/json": { schema: successData({ user: userSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete a user (admin and above)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Deleted" },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/users/{id}/role": {
      patch: {
        tags: ["Users"],
        summary: "Change a user's role (admin and above)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: { role: { type: "string", example: "accountant", description: "Any existing role name" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Updated user",
            content: { "application/json": { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/users/{id}/active": {
      patch: {
        tags: ["Users"],
        summary: "Activate or deactivate a user (admin and above)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["isActive"],
                properties: { isActive: { type: "boolean", example: false } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Updated user",
            content: { "application/json": { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/roles": {
      get: {
        tags: ["Roles"],
        summary: "List all roles",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Roles",
            content: {
              "application/json": {
                schema: successData({
                  roles: { type: "array", items: roleSchema },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ["Roles"],
        summary: "Create a custom role",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "supervisor" },
                  description: { type: "string", example: "Shift supervisor" },
                  permissions: {
                    type: "array",
                    items: { type: "string", enum: PERMISSION_VALUES },
                    example: ["users:read"],
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created role",
            content: { "application/json": { schema: successData({ role: roleSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    "/roles/permissions": {
      get: {
        tags: ["Roles"],
        summary: "List the permission catalog (for building a role editor)",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Permission catalog",
            content: {
              "application/json": {
                schema: successData({
                  permissions: {
                    type: "array",
                    items: { type: "string", enum: PERMISSION_VALUES },
                  },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    "/roles/{id}": {
      get: {
        tags: ["Roles"],
        summary: "Get a role by id",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Role",
            content: { "application/json": { schema: successData({ role: roleSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        tags: ["Roles"],
        summary: "Update a role's description/permissions (name is immutable; super_admin is locked)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  description: { type: "string", example: "Updated description" },
                  permissions: {
                    type: "array",
                    items: { type: "string", enum: PERMISSION_VALUES },
                    example: ["users:read", "users:create"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Updated role",
            content: { "application/json": { schema: successData({ role: roleSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ["Roles"],
        summary: "Delete a custom role (built-in roles and in-use roles cannot be deleted)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Deleted" },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
  },
};

module.exports = swaggerSpec;
