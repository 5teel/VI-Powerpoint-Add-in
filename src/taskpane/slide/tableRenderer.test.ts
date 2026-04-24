/**
 * Tests for addTable(shapes, headers, rows, region, options?) — TABL-NATV-01.
 *
 * Absent options preserve existing behaviour verbatim (backward compat).
 * Options ordering: row totals → row numbers → column totals, so the
 * bottom-right cell is the grand total when both dimensions are on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { addTable, type TableRenderOptions } from "./tableRenderer";

describe("addTable with TableRenderOptions", () => {
  let shapesMock: any;
  let addTableSpy: any;

  beforeEach(() => {
    addTableSpy = vi.fn().mockReturnValue({
      textFrame: { textRange: { font: {} } },
      lineFormat: { weight: 0 },
    });
    shapesMock = { addTable: addTableSpy };
    // Re-stub PowerPoint enum references used by module-level constants in tableRenderer.
    vi.stubGlobal("PowerPoint", {
      ParagraphHorizontalAlignment: { left: "left", center: "center", right: "right" },
      TextVerticalAlignment: { top: "top", middle: "middle", bottom: "bottom" },
      ShapeLineDashStyle: { solid: "solid", dash: "dash" },
    });
  });

  const REGION = { left: 0, top: 0, width: 400, height: 200 };

  it("preserves existing behaviour when options are absent", () => {
    addTable(shapesMock as any, ["A", "B"], [["x", 1], ["y", 2]], REGION);
    expect(addTableSpy).toHaveBeenCalledTimes(1);
    const [rowCount, colCount, props] = addTableSpy.mock.calls[0];
    expect(rowCount).toBe(3); // 2 body rows + 1 header
    expect(colCount).toBe(2);
    expect(props.values[0]).toEqual(["A", "B"]);
    // formatCellValue("x") → "x", formatCellValue(1) → "1"
    expect(props.values[1][0]).toBe("x");
    expect(props.values[2][0]).toBe("y");
  });

  it("TABL-NATV-01: showRowNumbers prepends # column", () => {
    addTable(
      shapesMock as any,
      ["A", "B"],
      [["x", 1], ["y", 2]],
      REGION,
      { showRowNumbers: true }
    );
    const [, colCount, props] = addTableSpy.mock.calls[0];
    expect(colCount).toBe(3);
    expect(props.values[0]).toEqual(["#", "A", "B"]);
    // Row 1: "1" (formatted from number 1), then "x", "1"
    expect(props.values[1][0]).toBe("1");
    expect(props.values[1][1]).toBe("x");
    expect(props.values[2][0]).toBe("2");
    expect(props.values[2][1]).toBe("y");
  });

  it("TABL-NATV-01: showColumnTotals appends a footer row with numeric sums", () => {
    addTable(
      shapesMock as any,
      ["A", "B"],
      [["x", 10], ["y", 20]],
      REGION,
      { showColumnTotals: true }
    );
    const [rowCount, , props] = addTableSpy.mock.calls[0];
    expect(rowCount).toBe(4); // header + 2 body + footer
    const footer = props.values[3];
    expect(footer[0]).toBe("Total"); // leftmost non-numeric column gets "Total" label
    expect(footer[1]).toBe("30"); // formatCellValue(30) → "30"
  });

  it("TABL-NATV-01: showRowTotals appends a Total column with per-row sums", () => {
    addTable(
      shapesMock as any,
      ["A", "B"],
      [[10, 20], [30, 40]],
      REGION,
      { showRowTotals: true }
    );
    const [, colCount, props] = addTableSpy.mock.calls[0];
    expect(colCount).toBe(3);
    expect(props.values[0]).toEqual(["A", "B", "Total"]);
    // Body rows contain formatted numbers — sum of 10+20=30, 30+40=70
    expect(props.values[1][2]).toBe("30");
    expect(props.values[2][2]).toBe("70");
  });

  it("TABL-NATV-01: showRowNumbers + showRowTotals + showColumnTotals produces correct grand total", () => {
    addTable(
      shapesMock as any,
      ["A", "B"],
      [[10, 20], [30, 40]],
      REGION,
      {
        showRowNumbers: true,
        showRowTotals: true,
        showColumnTotals: true,
      }
    );
    const [rowCount, colCount, props] = addTableSpy.mock.calls[0];
    expect(colCount).toBe(4); // # + A + B + Total
    expect(rowCount).toBe(4); // header + 2 body + footer
    // Header row: ["#", "A", "B", "Total"]
    expect(props.values[0]).toEqual(["#", "A", "B", "Total"]);
    // Body row 1: ["1", "10", "20", "30"]
    expect(props.values[1][0]).toBe("1");
    expect(props.values[1][1]).toBe("10");
    expect(props.values[1][2]).toBe("20");
    expect(props.values[1][3]).toBe("30");
    // Body row 2: ["2", "30", "40", "70"]
    expect(props.values[2][0]).toBe("2");
    expect(props.values[2][1]).toBe("30");
    expect(props.values[2][2]).toBe("40");
    expect(props.values[2][3]).toBe("70");
    // Footer: "Total" (under # col), column sums, grand total
    expect(props.values[3][0]).toBe("Total");
    expect(props.values[3][1]).toBe("40"); // 10 + 30
    expect(props.values[3][2]).toBe("60"); // 20 + 40
    expect(props.values[3][3]).toBe("100"); // grand total
  });

  it("TABL-NATV-01: showPagination logs info and does not break rendering", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    addTable(shapesMock as any, ["A"], [["x"]], REGION, { showPagination: true });
    expect(infoSpy).toHaveBeenCalled();
    expect(addTableSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("maxRows overrides the default 10-row cap", () => {
    const bigRows = Array.from({ length: 20 }, (_, i) => [`r${i}`, i]);
    addTable(shapesMock as any, ["A", "B"], bigRows, REGION, { maxRows: 5 });
    const [rowCount] = addTableSpy.mock.calls[0];
    expect(rowCount).toBe(6); // header + 5 body rows
  });

  it("exports TableRenderOptions with expected fields", () => {
    // Purely a type-level existence check — if TableRenderOptions isn't exported,
    // this test fails at import. The object literal below must also accept all
    // five documented option keys.
    const opts: TableRenderOptions = {
      showRowNumbers: true,
      showColumnTotals: true,
      showRowTotals: true,
      showPagination: true,
      maxRows: 20,
    };
    expect(opts.showRowNumbers).toBe(true);
    expect(opts.maxRows).toBe(20);
  });
});
