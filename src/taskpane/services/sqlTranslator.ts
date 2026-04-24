/**
 * Cube AI SQL → Cube REST query translator (Phase 5 D-15, SQL-01).
 *
 * Cube AI emits flat SELECT ... FROM <cube> [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT ...]
 * with MEASURE(...) wrappers around measure fields and bare identifiers for dimensions.
 *
 * Scope: no JOINs, no subqueries, no CTEs, no HAVING, no UNION, no window functions.
 * Throws UnsupportedSqlError on any of those.
 */
import type { CubeQuery } from "./cubeDataClient";

export class UnsupportedSqlError extends Error {
  constructor(
    public readonly clause: string,
    message?: string
  ) {
    super(message ?? `Unsupported SQL clause: ${clause}`);
    this.name = "UnsupportedSqlError";
  }
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bJOIN\b/i, label: "JOIN" },
  { pattern: /\bWITH\s+\w+\s+AS\s*\(/i, label: "CTE" },
  { pattern: /\bHAVING\b/i, label: "HAVING" },
  { pattern: /\bUNION\b/i, label: "UNION" },
  { pattern: /\bINTERSECT\b/i, label: "INTERSECT" },
  { pattern: /\bEXCEPT\b/i, label: "EXCEPT" },
  { pattern: /\bOVER\s*\(/i, label: "window function" },
  { pattern: /MEASURE\s*\(\s*MEASURE\s*\(/i, label: "nested MEASURE()" },
  // Subquery: a "(" followed by SELECT inside WHERE/SELECT. Detected below.
];

const DATE_GRANULARITIES = new Set(["day", "week", "month", "quarter", "year", "hour", "minute", "second"]);

export function translateSql(sqlQuery: string): CubeQuery {
  const sql = sqlQuery.trim().replace(/;$/, "");

  // Forbidden-shape gate
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
      throw new UnsupportedSqlError(label);
    }
  }
  // Subquery detector: "(SELECT" anywhere
  if (/\(\s*SELECT\b/i.test(sql)) {
    throw new UnsupportedSqlError("subquery");
  }

  // Extract clauses (greedy, case-insensitive).
  const fromMatch = sql.match(/\bFROM\s+([a-zA-Z_][\w.]*)/i);
  if (!fromMatch) throw new UnsupportedSqlError("FROM", "Missing FROM clause");
  const cubeName = fromMatch[1];

  const selectMatch = sql.match(/^SELECT\s+(.+?)\s+FROM\b/is);
  if (!selectMatch) throw new UnsupportedSqlError("SELECT");
  const selectClause = selectMatch[1];

  const whereMatch = sql.match(/\bWHERE\s+(.+?)(\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is);
  const orderByMatch = sql.match(/\bORDER\s+BY\s+(.+?)(\s+LIMIT|$)/is);
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);

  const result: CubeQuery = {};
  const timeDimensions: NonNullable<CubeQuery["timeDimensions"]> = [];

  // Parse SELECT — split on top-level commas, detect MEASURE(...) vs DATE_TRUNC(...) vs bare identifier.
  const selectItems = splitTopLevelCommas(selectClause);
  const measures: string[] = [];
  const dimensions: string[] = [];
  for (const raw of selectItems) {
    const item = raw.trim();
    const measureMatch = item.match(/^MEASURE\s*\(\s*([a-zA-Z_][\w.]*)\s*\)(\s+AS\s+\w+)?$/i);
    const dateTruncMatch = item.match(/^DATE_TRUNC\s*\(\s*'(\w+)'\s*,\s*([a-zA-Z_][\w.]*)\s*\)(\s+AS\s+\w+)?$/i);
    const bareIdent = item.match(/^([a-zA-Z_][\w.]*)(\s+AS\s+\w+)?$/);
    if (measureMatch) {
      measures.push(qualify(cubeName, measureMatch[1]));
    } else if (dateTruncMatch) {
      const granularity = dateTruncMatch[1].toLowerCase();
      if (!DATE_GRANULARITIES.has(granularity)) {
        throw new UnsupportedSqlError(`DATE_TRUNC granularity '${granularity}'`);
      }
      timeDimensions.push({ dimension: qualify(cubeName, dateTruncMatch[2]), granularity });
    } else if (bareIdent) {
      dimensions.push(qualify(cubeName, bareIdent[1]));
    } else {
      throw new UnsupportedSqlError(`SELECT item '${item}'`);
    }
  }
  if (measures.length) result.measures = measures;
  if (dimensions.length) result.dimensions = dimensions;

  // Parse WHERE — AND-joined conditions. Must not split on the AND inside BETWEEN x AND y.
  if (whereMatch) {
    const conditions = splitTopLevelAnd(whereMatch[1]);
    const filters: NonNullable<CubeQuery["filters"]> = [];
    for (const cond of conditions) {
      parseCondition(cond, cubeName, filters, timeDimensions);
    }
    if (filters.length) result.filters = filters;
  }
  if (timeDimensions.length) result.timeDimensions = timeDimensions;

  // Parse ORDER BY.
  if (orderByMatch) {
    const orderItems = splitTopLevelCommas(orderByMatch[1]);
    const order: NonNullable<CubeQuery["order"]> = [];
    for (const raw of orderItems) {
      const m = raw.trim().match(/^([a-zA-Z_][\w.]*|MEASURE\s*\(\s*[a-zA-Z_][\w.]*\s*\))(\s+(ASC|DESC))?$/i);
      if (!m) throw new UnsupportedSqlError(`ORDER BY '${raw}'`);
      const col = m[1].replace(/^MEASURE\s*\(\s*([a-zA-Z_][\w.]*)\s*\)$/i, "$1");
      const dir = (m[3] ?? "asc").toLowerCase() as "asc" | "desc";
      order.push([qualify(cubeName, col), dir]);
    }
    result.order = order;
  }

  // Parse LIMIT.
  if (limitMatch) result.limit = Number(limitMatch[1]);

  return result;
}

function qualify(cubeName: string, ident: string): string {
  return ident.includes(".") ? ident : `${cubeName}.${ident}`;
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Split a WHERE clause on top-level AND boundaries, but NOT on the AND inside
 * `BETWEEN x AND y`. Also respects parenthesis depth and skips AND inside quoted strings.
 */
function splitTopLevelAnd(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  // Track when we are between BETWEEN and its matching AND.
  let pendingBetween = false;

  let lastCut = 0;

  // Walk the string char by char, tracking quotes and paren depth.
  // Detect uppercase/lowercase keywords BETWEEN and AND case-insensitively.
  const upper = s.toUpperCase();

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inSingleQuote) {
      if (c === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (c === '"') inDoubleQuote = false;
      continue;
    }
    if (c === "'") {
      inSingleQuote = true;
      continue;
    }
    if (c === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (c === "(") {
      depth++;
      continue;
    }
    if (c === ")") {
      depth--;
      continue;
    }
    if (depth !== 0) continue;

    // At depth 0 — check for BETWEEN keyword (word boundary).
    if (!pendingBetween && isKeywordAt(upper, i, "BETWEEN")) {
      pendingBetween = true;
      i += "BETWEEN".length - 1;
      continue;
    }
    // Check for AND keyword (word boundary).
    if (isKeywordAt(upper, i, "AND")) {
      if (pendingBetween) {
        // This AND belongs to a BETWEEN — consume it.
        pendingBetween = false;
        i += "AND".length - 1;
        continue;
      }
      // Top-level AND — split here.
      const piece = s.slice(lastCut, i).trim();
      if (piece) out.push(piece);
      lastCut = i + "AND".length;
      i += "AND".length - 1;
      continue;
    }
  }
  const tail = s.slice(lastCut).trim();
  if (tail) out.push(tail);
  return out;
}

function isKeywordAt(upperStr: string, i: number, kw: string): boolean {
  if (upperStr.slice(i, i + kw.length) !== kw) return false;
  const prev = i === 0 ? " " : upperStr[i - 1];
  const next = i + kw.length >= upperStr.length ? " " : upperStr[i + kw.length];
  return !/\w/.test(prev) && !/\w/.test(next);
}

function parseCondition(
  cond: string,
  cubeName: string,
  filters: NonNullable<CubeQuery["filters"]>,
  timeDimensions: NonNullable<CubeQuery["timeDimensions"]>
): void {
  // IS NULL / IS NOT NULL
  let m = cond.match(/^([a-zA-Z_][\w.]*)\s+IS\s+(NOT\s+)?NULL$/i);
  if (m) {
    filters.push({ member: qualify(cubeName, m[1]), operator: m[2] ? "set" : "notSet", values: [] });
    return;
  }
  // BETWEEN
  m = cond.match(/^([a-zA-Z_][\w.]*)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (m) {
    const col = qualify(cubeName, m[1]);
    const a = unquote(m[2]);
    const b = unquote(m[3]);
    // If both bounds parse as date strings, treat as timeDimensions dateRange
    if (isDateLiteral(a) && isDateLiteral(b)) {
      timeDimensions.push({ dimension: col, dateRange: [a, b] });
    } else {
      filters.push({ member: col, operator: "gte", values: [a] });
      filters.push({ member: col, operator: "lte", values: [b] });
    }
    return;
  }
  // IN (...)
  m = cond.match(/^([a-zA-Z_][\w.]*)\s+IN\s*\(\s*(.+?)\s*\)$/i);
  if (m) {
    const values = splitTopLevelCommas(m[2]).map((v) => unquote(v.trim()));
    filters.push({ member: qualify(cubeName, m[1]), operator: "equals", values });
    return;
  }
  // LIKE
  m = cond.match(/^([a-zA-Z_][\w.]*)\s+LIKE\s+'(.+)'$/i);
  if (m) {
    const raw = m[2];
    // Strip leading/trailing % for contains
    const core = raw.replace(/^%+|%+$/g, "");
    filters.push({ member: qualify(cubeName, m[1]), operator: "contains", values: [core] });
    return;
  }
  // Comparison: =, !=, <>, >, <, >=, <=
  m = cond.match(/^([a-zA-Z_][\w.]*)\s*(=|<>|!=|>=|<=|>|<)\s*(.+)$/);
  if (m) {
    const col = qualify(cubeName, m[1]);
    const op = m[2];
    const val = unquote(m[3].trim());
    const operator =
      op === "="
        ? "equals"
        : op === "!=" || op === "<>"
          ? "notEquals"
          : op === ">"
            ? "gt"
            : op === "<"
              ? "lt"
              : op === ">="
                ? "gte"
                : "lte";
    filters.push({ member: col, operator, values: [val] });
    return;
  }
  throw new UnsupportedSqlError(`WHERE condition '${cond}'`);
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

function isDateLiteral(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(s);
}
