import { describe, it, expect } from "vitest";
import { translateSql, UnsupportedSqlError } from "./sqlTranslator";

describe("translateSql", () => {
  it("SQL-01: MEASURE() stripped and qualified", () => {
    expect(translateSql("SELECT MEASURE(revenue) FROM sales_view")).toEqual({
      measures: ["sales_view.revenue"],
    });
  });

  it("SQL-01: SELECT with dimension + measure + GROUP BY + ORDER BY + LIMIT", () => {
    const out = translateSql(
      "SELECT state, MEASURE(revenue) FROM sales_view GROUP BY state ORDER BY revenue DESC LIMIT 10"
    );
    expect(out.measures).toEqual(["sales_view.revenue"]);
    expect(out.dimensions).toEqual(["sales_view.state"]);
    expect(out.order).toEqual([["sales_view.revenue", "desc"]]);
    expect(out.limit).toBe(10);
  });

  it("SQL-01: BETWEEN on date column → timeDimensions dateRange", () => {
    const out = translateSql(
      "SELECT MEASURE(revenue) FROM sales_view WHERE date BETWEEN '2024-01-01' AND '2024-12-31'"
    );
    expect(out.timeDimensions).toEqual([
      { dimension: "sales_view.date", dateRange: ["2024-01-01", "2024-12-31"] },
    ]);
    expect(out.filters).toBeUndefined();
  });

  it("SQL-01: BETWEEN on numeric column → two gte/lte filters", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE revenue BETWEEN 100 AND 200");
    expect(out.filters).toEqual([
      { member: "s.revenue", operator: "gte", values: ["100"] },
      { member: "s.revenue", operator: "lte", values: ["200"] },
    ]);
  });

  it("SQL-01: WHERE = maps to equals", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE state = 'NSW'");
    expect(out.filters).toEqual([{ member: "s.state", operator: "equals", values: ["NSW"] }]);
  });

  it("SQL-01: WHERE IN maps to equals (multi-value)", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE region IN ('NSW', 'VIC')");
    expect(out.filters).toEqual([{ member: "s.region", operator: "equals", values: ["NSW", "VIC"] }]);
  });

  it("SQL-01: WHERE > maps to gt", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE revenue > 1000000");
    expect(out.filters).toEqual([{ member: "s.revenue", operator: "gt", values: ["1000000"] }]);
  });

  it("SQL-01: WHERE LIKE '%foo%' maps to contains 'foo'", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE name LIKE '%store%'");
    expect(out.filters).toEqual([{ member: "s.name", operator: "contains", values: ["store"] }]);
  });

  it("SQL-01: WHERE IS NULL → notSet / IS NOT NULL → set", () => {
    expect(translateSql("SELECT MEASURE(m) FROM s WHERE x IS NULL").filters).toEqual([
      { member: "s.x", operator: "notSet", values: [] },
    ]);
    expect(translateSql("SELECT MEASURE(m) FROM s WHERE x IS NOT NULL").filters).toEqual([
      { member: "s.x", operator: "set", values: [] },
    ]);
  });

  it("SQL-01: DATE_TRUNC('day', date) → timeDimensions with granularity", () => {
    const out = translateSql("SELECT DATE_TRUNC('day', date), MEASURE(m) FROM s GROUP BY 1");
    expect(out.timeDimensions).toEqual([{ dimension: "s.date", granularity: "day" }]);
    expect(out.measures).toEqual(["s.m"]);
  });

  it("SQL-01: WHERE with AND joins multiple filters", () => {
    const out = translateSql("SELECT MEASURE(m) FROM s WHERE state = 'NSW' AND year > 2023");
    expect(out.filters).toEqual([
      { member: "s.state", operator: "equals", values: ["NSW"] },
      { member: "s.year", operator: "gt", values: ["2023"] },
    ]);
  });

  it("SQL-01: throws UnsupportedSqlError on JOIN", () => {
    expect(() => translateSql("SELECT MEASURE(m) FROM s JOIN t ON s.id = t.id")).toThrow(
      UnsupportedSqlError
    );
  });

  it("SQL-01: throws UnsupportedSqlError on CTE", () => {
    expect(() => translateSql("WITH x AS (SELECT 1) SELECT MEASURE(m) FROM x")).toThrow(
      UnsupportedSqlError
    );
  });

  it("SQL-01: throws UnsupportedSqlError on subquery in WHERE", () => {
    expect(() => translateSql("SELECT MEASURE(m) FROM s WHERE id IN (SELECT id FROM t)")).toThrow(
      UnsupportedSqlError
    );
  });

  it("SQL-01: throws UnsupportedSqlError on HAVING", () => {
    expect(() =>
      translateSql("SELECT state, MEASURE(m) FROM s GROUP BY state HAVING MEASURE(m) > 0")
    ).toThrow(UnsupportedSqlError);
  });

  it("SQL-01: throws UnsupportedSqlError on window function", () => {
    expect(() => translateSql("SELECT ROW_NUMBER() OVER (ORDER BY m) FROM s")).toThrow(
      UnsupportedSqlError
    );
  });

  it("SQL-01: throws UnsupportedSqlError on nested MEASURE()", () => {
    expect(() => translateSql("SELECT MEASURE(MEASURE(m)) FROM s")).toThrow(UnsupportedSqlError);
  });
});
