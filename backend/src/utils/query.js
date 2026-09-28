/**
 * Shared helpers for turning untrusted query-string input into safe values:
 * bounded pagination and regex-escaped search terms. Keeping these in one place
 * means every list endpoint clamps the same way and no raw user input ever
 * reaches a regex.
 */

/**
 * Coerce `page`/`limit` query params to safe integers. A missing/garbage value
 * falls back to the default; `limit` is clamped to [1, maxLimit] and `page` to
 * >= 1 so a client can't request a million rows or a negative offset.
 */
function parsePagination({ page, limit } = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let p = parseInt(page, 10);
  let l = parseInt(limit, 10);
  if (!Number.isFinite(p) || p < 1) p = 1;
  if (!Number.isFinite(l) || l < 1) l = defaultLimit;
  if (l > maxLimit) l = maxLimit;
  return { page: p, limit: l, skip: (p - 1) * l };
}

/**
 * Escape regex metacharacters so a search term is matched literally. Without
 * this, input like `(a+)+$` is compiled as a pattern and can pin the CPU
 * (ReDoS) when used in a `$regex` filter.
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape SQL LIKE/ILIKE metacharacters (`%`, `_`, and the escape character
 * itself) so a search term is matched literally when interpolated into a
 * `LIKE '%' || :term || '%'`-style pattern. Callers still bind `term` as a
 * query replacement — this only neutralizes the wildcard characters inside it.
 */
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

module.exports = { parsePagination, escapeRegex, escapeLike };
