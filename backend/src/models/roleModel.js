const mongoose = require('mongoose');
const { PERMISSION_VALUES, WILDCARD } = require('../utils/permissions');

/**
 * A role is a named bundle of permissions. The five built-in roles are
 * seeded with isSystem=true and are protected from rename/deletion; super
 * admins can additionally create custom roles with any subset of the
 * permission catalog.
 *
 * `name` is the stable identifier referenced by User.role, so it is
 * immutable after creation (renaming would orphan existing users).
 */
const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (perms) => perms.every((p) => p === WILDCARD || PERMISSION_VALUES.includes(p)),
        message: 'permissions contains an unknown permission',
      },
    },
    // Built-in roles cannot be renamed or deleted.
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

roleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Role', roleSchema);
