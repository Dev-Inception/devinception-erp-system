/**
 * Standard success envelope so every endpoint responds in the same shape:
 *   { success: true, message, data }
 */
function sendSuccess(res, statusCode = 200, message = "OK", data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

module.exports = { sendSuccess };
