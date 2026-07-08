const env = require('./env');
const { PERMISSION_VALUES } = require('../utils/permissions');

/**
 * OpenAPI 3 specification for the POS auth API. Served via swagger-ui at
 * /api/docs. Kept as a single hand-written spec so request bodies, auth
 * schemes and response shapes stay accurate and in one place.
 */

// Reusable response envelope helpers.
const successData = (properties) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: { type: 'object', properties: properties },
  },
});

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Field-keyed validation messages (when applicable)',
          },
        },
      },
    },
  },
};

const userSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '6a398f83d9b8a761a28ae4b6' },
    name: { type: 'string', example: 'Super Admin' },
    email: { type: 'string', example: 'superadmin@devinception.com' },
    role: {
      type: 'string',
      example: 'super_admin',
      description: 'Name of an existing role (built-in or custom)',
    },
    isActive: { type: 'boolean', example: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const roleSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '6a398f83d9b8a761a28ae4c1' },
    name: { type: 'string', example: 'supervisor' },
    description: { type: 'string', example: 'Shift supervisor' },
    permissions: {
      type: 'array',
      items: { type: 'string', enum: PERMISSION_VALUES },
      example: ['users:read'],
    },
    isSystem: {
      type: 'boolean',
      example: false,
      description: 'Built-in roles (true) cannot be renamed or deleted',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

// Compact helpers for the operational endpoints below.
const PAYMENT_METHODS_ENUM = ['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'MIXED', 'CREDIT'];
const pathId = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const qPage = { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } };
const qLimit = { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } };
const qSearch = { name: 'search', in: 'query', schema: { type: 'string' } };
const qFrom = { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } };
const qTo = { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } };
const jsonBody = (required, properties) => ({
  required: true,
  content: {
    'application/json': {
      schema: { type: 'object', required, properties },
    },
  },
});

const vendorSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '6a398f83d9b8a761a28ae4d2' },
    name: { type: 'string', example: 'Acme Distributors' },
    phone: { type: 'string', example: '+92 321 0000000' },
    email: { type: 'string', example: 'acme@supplier.com' },
    ntn: { type: 'string', example: '1234567-8', description: 'Tax identifier' },
    address: { type: 'string', example: 'Hall Road, Lahore' },
    outstanding: {
      type: 'number',
      example: 8600,
      description: 'Payable balance; maintained by purchase flows, read-only here',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const customerSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '6a398f83d9b8a761a28ae4e3' },
    name: { type: 'string', example: 'Jane Retail' },
    phone: { type: 'string', example: '0300 1234567' },
    email: { type: 'string', example: 'jane@buyer.com' },
    address: { type: 'string', example: 'Gulberg, Lahore' },
    creditLimit: { type: 'number', example: 50000 },
    outstanding: {
      type: 'number',
      example: 0,
      description: 'Receivable balance; maintained by sale flows, read-only here',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const labourSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '6a398f83d9b8a761a28ae5a1' },
    name: { type: 'string', example: 'Workshop Labour' },
    phoneNumber: { type: 'string', example: '0300 1234567' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const productWriteProperties = {
  name: { type: 'string', example: 'Widget' },
  sku: { type: 'string', example: 'WIDG-1' },
  barcode: { type: 'string', example: '1234567890123' },
  categoryId: { type: 'string', description: 'Existing category id' },
  brandId: { type: 'string', description: 'Existing brand id' },
  unitId: { type: 'string', description: 'Existing unit id' },
  category: { type: 'string', example: 'Hardware', description: 'Free-text category name' },
  brand: { type: 'string', example: 'Generic', description: 'Free-text brand name' },
  unit: { type: 'string', example: 'pcs', description: 'Free-text unit name' },
  purchasePrice: { type: 'number', example: 35, description: 'Rupees' },
  salePrice: { type: 'number', example: 100, description: 'Rupees' },
  taxPercent: { type: 'number', example: 0 },
  minStock: { type: 'number', example: 5 },
};

const authTokenResponse = {
  description: 'Success',
  content: {
    'application/json': {
      schema: successData({
        user: userSchema,
        accessToken: { type: 'string' },
      }),
    },
  },
};

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Point of Sale — Auth & RBAC API',
    version: '1.0.0',
    description:
      'JWT authentication with role-based access control. ' +
      'Click **Authorize**, paste an access token from /auth/login, then try the protected endpoints.',
  },
  servers: [{ url: `http://localhost:${env.port}/api`, description: 'Local' }],
  tags: [
    { name: 'Auth', description: 'Registration, login, password reset' },
    { name: 'Users', description: 'Admin user management (RBAC protected)' },
    { name: 'Roles', description: 'Role & permission management (super_admin only)' },
    { name: 'Vendors', description: 'Supplier management (RBAC protected)' },
    { name: 'Customers', description: 'Customer management (RBAC protected)' },
    {
      name: 'Labour',
      description: 'Labour master data; POS users can read, only super_admin can manage',
    },
    { name: 'Inventory', description: 'Warehouses, products and stock' },
    { name: 'Purchases', description: 'Goods purchases from vendors' },
    { name: 'Sales', description: 'POS sales' },
    { name: 'Invoices', description: 'Customer billing documents (A/R)' },
    { name: 'Finance', description: 'Bank accounts, payments, ledgers and cash book' },
    { name: 'Reports', description: 'Sales, purchases, stock valuation and P&L' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the accessToken returned by /auth/login',
      },
    },
    schemas: {
      User: userSchema,
      Role: roleSchema,
      Vendor: vendorSchema,
      Customer: customerSchema,
      Labour: labourSchema,
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive an access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'superadmin@devinception.com' },
                  password: { type: 'string', example: 'ChangeMe123!' },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse, 401: errorResponse },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange the refresh-token cookie for a new access token',
        description:
          'Reads the httpOnly refreshToken cookie (set at login) or a refreshToken in the body.',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'New access token',
            content: {
              'application/json': {
                schema: successData({ accessToken: { type: 'string' } }),
              },
            },
          },
          401: errorResponse,
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Clear the refresh-token cookie',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password-reset link',
        description:
          'Always returns 200. Without SMTP configured the reset link is printed to the server console.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', example: 'jane@devinception.com' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Generic acknowledgement' }, 400: errorResponse },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using the emailed token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string', description: 'Raw token from the reset link' },
                  password: { type: 'string', example: 'NewPassw0rd123' },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Current user',
            content: {
              'application/json': { schema: successData({ user: userSchema }) },
            },
          },
          401: errorResponse,
        },
      },
    },
    '/auth/change-password': {
      patch: {
        tags: ['Auth'],
        summary: 'Change password while logged in',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', example: 'ChangeMe123!' },
                  newPassword: { type: 'string', example: 'NewPassw0rd123' },
                },
              },
            },
          },
        },
        responses: { 200: authTokenResponse, 400: errorResponse, 401: errorResponse },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (manager and above)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'role',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by role name',
          },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Paginated users',
            content: {
              'application/json': {
                schema: successData({
                  users: { type: 'array', items: userSchema },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user with an explicit role (admin and above)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'role'],
                properties: {
                  name: { type: 'string', example: 'Mark Manager' },
                  email: { type: 'string', example: 'mark@devinception.com' },
                  password: { type: 'string', example: 'Passw0rd123' },
                  role: {
                    type: 'string',
                    example: 'manager',
                    description: 'Any existing role name',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created user',
            content: { 'application/json': { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get a user by id (manager and above)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'User',
            content: { 'application/json': { schema: successData({ user: userSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete a user (admin and above)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/users/{id}/role': {
      patch: {
        tags: ['Users'],
        summary: "Change a user's role (admin and above)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: {
                    type: 'string',
                    example: 'accountant',
                    description: 'Any existing role name',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated user',
            content: { 'application/json': { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/users/{id}/active': {
      patch: {
        tags: ['Users'],
        summary: 'Activate or deactivate a user (admin and above)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['isActive'],
                properties: { isActive: { type: 'boolean', example: false } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated user',
            content: { 'application/json': { schema: successData({ user: userSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/roles': {
      get: {
        tags: ['Roles'],
        summary: 'List all roles',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Roles',
            content: {
              'application/json': {
                schema: successData({
                  roles: { type: 'array', items: roleSchema },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ['Roles'],
        summary: 'Create a custom role',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'supervisor' },
                  description: { type: 'string', example: 'Shift supervisor' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string', enum: PERMISSION_VALUES },
                    example: ['users:read'],
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created role',
            content: { 'application/json': { schema: successData({ role: roleSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/roles/permissions': {
      get: {
        tags: ['Roles'],
        summary: 'List the permission catalog (for building a role editor)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Permission catalog',
            content: {
              'application/json': {
                schema: successData({
                  permissions: {
                    type: 'array',
                    items: { type: 'string', enum: PERMISSION_VALUES },
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
    '/roles/{id}': {
      get: {
        tags: ['Roles'],
        summary: 'Get a role by id',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Role',
            content: { 'application/json': { schema: successData({ role: roleSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        tags: ['Roles'],
        summary:
          "Update a role's description/permissions (name is immutable; super_admin is locked)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  description: { type: 'string', example: 'Updated description' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string', enum: PERMISSION_VALUES },
                    example: ['users:read', 'users:create'],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated role',
            content: { 'application/json': { schema: successData({ role: roleSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['Roles'],
        summary: 'Delete a custom role (built-in roles and in-use roles cannot be deleted)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/vendors': {
      get: {
        tags: ['Vendors'],
        summary: 'List vendors (requires vendors:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string' },
            description: 'Match name, phone or email',
          },
        ],
        responses: {
          200: {
            description: 'Paginated vendors',
            content: {
              'application/json': {
                schema: successData({
                  vendors: { type: 'array', items: vendorSchema },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ['Vendors'],
        summary: 'Create a vendor (requires vendors:create)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Acme Distributors' },
                  phone: { type: 'string', example: '+92 321 0000000' },
                  email: { type: 'string', example: 'acme@supplier.com' },
                  ntn: { type: 'string', example: '1234567-8' },
                  address: { type: 'string', example: 'Hall Road, Lahore' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created vendor',
            content: { 'application/json': { schema: successData({ vendor: vendorSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/vendors/{id}': {
      get: {
        tags: ['Vendors'],
        summary: 'Get a vendor by id (requires vendors:read)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Vendor',
            content: { 'application/json': { schema: successData({ vendor: vendorSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        tags: ['Vendors'],
        summary: 'Update a vendor (requires vendors:update)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Acme Distributors' },
                  phone: { type: 'string', example: '+92 300 1111111' },
                  email: { type: 'string', example: 'acme@supplier.com' },
                  ntn: { type: 'string', example: '1234567-8' },
                  address: { type: 'string', example: 'Hall Road, Lahore' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated vendor',
            content: { 'application/json': { schema: successData({ vendor: vendorSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['Vendors'],
        summary: 'Delete a vendor (requires vendors:delete; blocked if outstanding > 0)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/customers': {
      get: {
        tags: ['Customers'],
        summary: 'List customers (requires customers:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string' },
            description: 'Match name, phone or email',
          },
        ],
        responses: {
          200: {
            description: 'Paginated customers',
            content: {
              'application/json': {
                schema: successData({
                  customers: { type: 'array', items: customerSchema },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ['Customers'],
        summary: 'Create a customer (requires customers:create)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Jane Retail' },
                  phone: { type: 'string', example: '0300 1234567' },
                  email: { type: 'string', example: 'jane@buyer.com' },
                  address: { type: 'string', example: 'Gulberg, Lahore' },
                  creditLimit: { type: 'number', example: 50000 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created customer',
            content: { 'application/json': { schema: successData({ customer: customerSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/customers/{id}': {
      get: {
        tags: ['Customers'],
        summary: 'Get a customer by id (requires customers:read)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Customer',
            content: { 'application/json': { schema: successData({ customer: customerSchema }) } },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        tags: ['Customers'],
        summary: 'Update a customer (requires customers:update)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Jane Retail' },
                  phone: { type: 'string', example: '0300 1234567' },
                  email: { type: 'string', example: 'jane@buyer.com' },
                  address: { type: 'string', example: 'Gulberg, Lahore' },
                  creditLimit: { type: 'number', example: 75000 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated customer',
            content: { 'application/json': { schema: successData({ customer: customerSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['Customers'],
        summary: 'Delete a customer (requires customers:delete; blocked if outstanding > 0)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },

    '/labour': {
      get: {
        tags: ['Labour'],
        summary: 'List labour for POS selection (requires sales:create)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Labour list',
            content: {
              'application/json': {
                schema: successData({
                  labour: { type: 'array', items: labourSchema },
                }),
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        tags: ['Labour'],
        summary: 'Create labour (super_admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['name', 'phoneNumber'], {
          name: { type: 'string', example: 'Workshop Labour' },
          phoneNumber: { type: 'string', example: '0300 1234567' },
        }),
        responses: {
          201: {
            description: 'Created labour',
            content: { 'application/json': { schema: successData({ labour: labourSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/labour/{id}': {
      get: {
        tags: ['Labour'],
        summary: 'Get labour by id for POS selection (requires sales:create)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: {
            description: 'Labour',
            content: { 'application/json': { schema: successData({ labour: labourSchema }) } },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        tags: ['Labour'],
        summary: 'Update labour (super_admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody([], {
          name: { type: 'string', example: 'Installation Labour' },
          phoneNumber: { type: 'string', example: '0300 7654321' },
        }),
        responses: {
          200: {
            description: 'Updated labour',
            content: { 'application/json': { schema: successData({ labour: labourSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
      put: {
        tags: ['Labour'],
        summary: 'Update labour (super_admin only; PUT compatibility route)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody([], {
          name: { type: 'string', example: 'Installation Labour' },
          phoneNumber: { type: 'string', example: '0300 7654321' },
        }),
        responses: {
          200: {
            description: 'Updated labour',
            content: { 'application/json': { schema: successData({ labour: labourSchema }) } },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
      delete: {
        tags: ['Labour'],
        summary: 'Delete labour (super_admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },

    /* --------------------------- Inventory --------------------------- */
    '/warehouses': {
      get: {
        tags: ['Inventory'],
        summary: 'List warehouses (inventory:read)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Warehouses' }, 403: errorResponse },
      },
      post: {
        tags: ['Inventory'],
        summary: 'Create a warehouse (inventory:manage)',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['name'], {
          name: { type: 'string', example: 'Warehouse B' },
          location: { type: 'string', example: 'Downtown' },
          address: { type: 'string' },
          isDefault: { type: 'boolean' },
        }),
        responses: { 201: { description: 'Created' }, 400: errorResponse, 403: errorResponse },
      },
    },
    '/warehouses/{id}': {
      patch: {
        tags: ['Inventory'],
        summary: 'Update a warehouse (inventory:manage)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: { description: 'Updated' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        tags: ['Inventory'],
        summary: 'Delete a warehouse (inventory:manage)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/products': {
      get: {
        tags: ['Inventory'],
        summary: 'List products with on-hand stock (inventory:read)',
        security: [{ bearerAuth: [] }],
        parameters: [qPage, qLimit, qSearch],
        responses: { 200: { description: 'Products' }, 403: errorResponse },
      },
      post: {
        tags: ['Inventory'],
        summary: 'Create a product (inventory:manage). Prices are rupees.',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['name', 'sku'], productWriteProperties),
        responses: {
          201: { description: 'Created' },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/products/{id}': {
      patch: {
        tags: ['Inventory'],
        summary: 'Update a product (inventory:manage)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody([], {
          ...productWriteProperties,
          isActive: { type: 'boolean', example: true },
        }),
        responses: {
          200: { description: 'Updated' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
      put: {
        tags: ['Inventory'],
        summary: 'Update a product (inventory:manage; PUT compatibility route)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody([], {
          ...productWriteProperties,
          isActive: { type: 'boolean', example: true },
        }),
        responses: {
          200: { description: 'Updated' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
      delete: {
        tags: ['Inventory'],
        summary: 'Delete a product (inventory:manage; blocked if stock remains)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/products/{id}/adjust-stock': {
      post: {
        tags: ['Inventory'],
        summary:
          'Adjust stock / opening balance (inventory:manage). Posts a balancing equity entry.',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody(['warehouse', 'delta'], {
          warehouse: { type: 'string' },
          delta: { type: 'number', example: 50, description: 'Signed quantity' },
          unitCost: {
            type: 'number',
            example: 35,
            description: 'Cost/unit (rupees) for positive deltas',
          },
          note: { type: 'string' },
        }),
        responses: {
          200: { description: 'Adjusted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },

    /* --------------------------- Purchases --------------------------- */
    '/purchases': {
      get: {
        tags: ['Purchases'],
        summary: 'List goods purchases (purchases:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          qPage,
          qLimit,
          { name: 'vendor', in: 'query', schema: { type: 'string' } },
          qFrom,
          qTo,
        ],
        responses: { 200: { description: 'Purchases' }, 403: errorResponse },
      },
      post: {
        tags: ['Purchases'],
        summary:
          'Record a goods purchase (purchases:create). Raises stock, posts Dr Inventory / Cr A-P; an amount paid posts a cash/bank payment.',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['vendor', 'items'], {
          vendor: { type: 'string' },
          warehouse: { type: 'string', description: 'Defaults to the default warehouse' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                quantity: { type: 'number', example: 100 },
                unitCost: { type: 'number', example: 35 },
              },
            },
          },
          paid: { type: 'number', example: 1000 },
          paymentMethod: { type: 'string', enum: PAYMENT_METHODS_ENUM },
          bankAccount: { type: 'string' },
        }),
        responses: {
          201: { description: 'Created' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/purchases/{id}': {
      get: {
        tags: ['Purchases'],
        summary: 'Get a purchase (purchases:read)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: { 200: { description: 'Purchase' }, 403: errorResponse, 404: errorResponse },
      },
    },

    /* ----------------------------- Sales ----------------------------- */
    '/sales': {
      get: {
        tags: ['Sales'],
        summary: 'List sales (sales:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          qPage,
          qLimit,
          { name: 'customer', in: 'query', schema: { type: 'string' } },
          qFrom,
          qTo,
        ],
        responses: { 200: { description: 'Sales' }, 403: errorResponse },
      },
      post: {
        tags: ['Sales'],
        summary: 'Record a POS sale (sales:create). Posts revenue + COGS and lowers stock.',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['items', 'payment'], {
          customer: { type: 'string', description: 'Omit for a walk-in sale' },
          warehouse: { type: 'string' },
          labour: {
            type: 'array',
            items: { type: 'string' },
            example: ['6a398f83d9b8a761a28ae5a1'],
            description:
              'Optional labour IDs selected for the current POS work. They are validated and snapshotted onto the sale.',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                quantity: { type: 'number', example: 3 },
                unitPrice: { type: 'number', description: 'Defaults to product sale price' },
              },
            },
          },
          discount: { type: 'number', example: 0 },
          payment: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: PAYMENT_METHODS_ENUM },
              cash: { type: 'number' },
              online: { type: 'number' },
              bankAccount: { type: 'string' },
              receiptRef: {
                type: 'string',
                description: 'Required when the sale has an online/bank-settled amount',
              },
            },
          },
        }),
        responses: {
          201: { description: 'Created' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/sales/{id}': {
      get: {
        tags: ['Sales'],
        summary: 'Get a sale (sales:read)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: { 200: { description: 'Sale' }, 403: errorResponse, 404: errorResponse },
      },
    },

    /* ---------------------------- Invoices --------------------------- */
    '/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List invoices (invoices:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          qPage,
          qLimit,
          { name: 'customer', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['UNPAID', 'PARTIAL', 'PAID'] },
          },
          qFrom,
          qTo,
        ],
        responses: { 200: { description: 'Invoices' }, 403: errorResponse },
      },
      post: {
        tags: ['Invoices'],
        summary:
          'Create a customer invoice (invoices:create). Lowers stock, posts Dr A-R / Cr Sales (+Tax).',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['customer', 'items'], {
          customer: { type: 'string' },
          warehouse: { type: 'string' },
          dueDate: { type: 'string', format: 'date' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
              },
            },
          },
          discount: { type: 'number' },
          taxPercent: { type: 'number', example: 1 },
        }),
        responses: {
          201: { description: 'Created' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/invoices/{id}': {
      get: {
        tags: ['Invoices'],
        summary: 'Get an invoice (invoices:read)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: { 200: { description: 'Invoice' }, 403: errorResponse, 404: errorResponse },
      },
    },
    '/invoices/{id}/pdf': {
      get: {
        tags: ['Invoices'],
        summary: 'Download an invoice as a PDF (invoices:read)',
        description: 'Returns a PDF binary (application/pdf), not the JSON envelope.',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: {
            description: 'PDF file',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/invoices/{id}/pay': {
      post: {
        tags: ['Invoices'],
        summary:
          'Record a payment against an invoice (invoices:create). Updates status UNPAID→PARTIAL→PAID.',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        requestBody: jsonBody(['amount'], {
          amount: { type: 'number' },
          method: { type: 'string', enum: PAYMENT_METHODS_ENUM },
          bankAccount: { type: 'string' },
        }),
        responses: {
          200: { description: 'Payment recorded' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },

    /* ---------------------------- Finance ---------------------------- */
    '/finance/bank-accounts': {
      get: {
        tags: ['Finance'],
        summary: 'List bank accounts with balances (finance:read)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Accounts' }, 403: errorResponse },
      },
      post: {
        tags: ['Finance'],
        summary: 'Create a bank account (finance:manage)',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['name'], {
          name: { type: 'string' },
          bankName: { type: 'string' },
          accountNumber: { type: 'string' },
          openingBalance: { type: 'number' },
        }),
        responses: { 201: { description: 'Created' }, 400: errorResponse, 403: errorResponse },
      },
    },
    '/finance/bank-accounts/{id}': {
      patch: {
        tags: ['Finance'],
        summary: 'Update a bank account (finance:manage)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
      },
      delete: {
        tags: ['Finance'],
        summary: 'Delete a bank account (finance:manage; blocked if non-zero balance)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId],
        responses: {
          200: { description: 'Deleted' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/finance/bank-accounts/{id}/ledger': {
      get: {
        tags: ['Finance'],
        summary: 'Bank account statement (finance:read)',
        security: [{ bearerAuth: [] }],
        parameters: [pathId, qFrom, qTo],
        responses: { 200: { description: 'Statement' }, 403: errorResponse, 404: errorResponse },
      },
    },
    '/finance/cash-ledger': {
      get: {
        tags: ['Finance'],
        summary: 'Cash book with running balance (finance:read)',
        security: [{ bearerAuth: [] }],
        parameters: [qFrom, qTo],
        responses: { 200: { description: 'Cash ledger' }, 403: errorResponse },
      },
    },
    '/finance/cash-entry': {
      post: {
        tags: ['Finance'],
        summary: 'Manual cash in/out (finance:manage)',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['direction', 'amount'], {
          direction: { type: 'string', enum: ['IN', 'OUT'] },
          amount: { type: 'number', example: 1000 },
          note: { type: 'string' },
        }),
        responses: { 201: { description: 'Recorded' }, 400: errorResponse, 403: errorResponse },
      },
    },
    '/finance/payments/vendor': {
      post: {
        tags: ['Finance'],
        summary: 'Pay a vendor (finance:manage). Dr A-P / Cr Cash|Bank.',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['vendor', 'amount'], {
          vendor: { type: 'string' },
          amount: { type: 'number' },
          method: { type: 'string', enum: PAYMENT_METHODS_ENUM },
          bankAccount: { type: 'string' },
          note: { type: 'string' },
        }),
        responses: {
          201: { description: 'Recorded' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/finance/payments/customer': {
      post: {
        tags: ['Finance'],
        summary: 'Receive from a customer (finance:manage). Dr Cash|Bank / Cr A-R.',
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(['customer', 'amount'], {
          customer: { type: 'string' },
          amount: { type: 'number' },
          method: { type: 'string', enum: PAYMENT_METHODS_ENUM },
          bankAccount: { type: 'string' },
          note: { type: 'string' },
        }),
        responses: {
          201: { description: 'Recorded' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/finance/ledgers/customers': {
      get: {
        tags: ['Finance'],
        summary: 'Customers with receivable balances (finance:read)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Customer ledgers' }, 403: errorResponse },
      },
    },
    '/finance/ledgers/vendors': {
      get: {
        tags: ['Finance'],
        summary: 'Vendors with payable balances (finance:read)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Vendor ledgers' }, 403: errorResponse },
      },
    },
    '/finance/ledgers/{kind}/{id}': {
      get: {
        tags: ['Finance'],
        summary: 'Party statement with running balance (finance:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'kind',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['customer', 'vendor'] },
          },
          pathId,
          qFrom,
          qTo,
        ],
        responses: {
          200: { description: 'Statement' },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },

    /* ---------------------------- Reports ---------------------------- */
    '/reports/{type}': {
      get: {
        tags: ['Reports'],
        summary: 'Generate a report (reports:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'type',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['sales', 'purchases', 'stock-valuation', 'profit-loss'],
            },
          },
          qFrom,
          qTo,
          {
            name: 'warehouse',
            in: 'query',
            schema: { type: 'string' },
            description: 'Stock-valuation only',
          },
        ],
        responses: { 200: { description: 'Report' }, 400: errorResponse, 403: errorResponse },
      },
    },

    /* --------------------------- Dashboard --------------------------- */
    '/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Home overview: headline cards, 30-day sales trend, top products (reports:read)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'warehouse',
            in: 'query',
            schema: { type: 'string' },
            description:
              'Scope sales/stock cards to one warehouse (ledger cards stay business-wide)',
          },
        ],
        responses: { 200: { description: 'Dashboard summary' }, 403: errorResponse },
      },
    },
  },
};

module.exports = swaggerSpec;
