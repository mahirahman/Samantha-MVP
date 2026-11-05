// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getPdfPageCount, mergePdfs, pdfFilename, splitPdf, validateSplitRanges } from "@/lib/pdf-operations";

async function pdf(widths: number[]) {
  const doc = await PDFDocument.create();
  widths.forEach((width) => doc.addPage([width, 200]));
  return new Uint8Array(await doc.save()).buffer;
}

describe("PDF operations", () => {
  it("splits pages 1–2 and 3–5 into independent files in order", async () => {
    const bytes = await pdf([101, 102, 103, 104, 105]);
    expect(await getPdfPageCount(bytes)).toBe(5);
    const files = await splitPdf(bytes, [{ name: "A", start: 1, end: 2 }, { name: "B.pdf", start: 3, end: 5 }]);
    expect(files.map((file) => file.name)).toEqual(["A.pdf", "B.pdf"]);
    for (const [index, expected] of [[0, [101, 102]], [1, [103, 104, 105]]] as const) {
      expect((await PDFDocument.load(await files[index].arrayBuffer())).getPages().map((page) => page.getWidth())).toEqual(expected);
    }
  });
  it.each([
    [[1, 1], [3, 5]], [[1, 3], [3, 5]], [[2, 1], [3, 5]],
    [[1.5, 2], [3, 5]], [[0, 2], [3, 5]], [[1, 2], [3, 6]],
  ])("rejects omitted, overlapping or invalid ranges %j and %j", (first, second) => {
    expect(() => validateSplitRanges([{ name: "A", start: first[0], end: first[1] }, { name: "B", start: second[0], end: second[1] }], 5)).toThrow();
  });
  it("requires at least two named outputs", () => {
    expect(() => validateSplitRanges([{ name: "A", start: 1, end: 5 }], 5)).toThrow("at least two");
    expect(() => validateSplitRanges([{ name: "", start: 1, end: 2 }, { name: "B", start: 3, end: 5 }], 5)).toThrow("filename");
  });
  it("merges all pages in the requested source order", async () => {
    const merged = await mergePdfs([await pdf([103, 104]), await pdf([101, 102])], "Combined");
    expect(merged.name).toBe("Combined.pdf");
    expect((await PDFDocument.load(await merged.arrayBuffer())).getPages().map((page) => page.getWidth())).toEqual([103, 104, 101, 102]);
  });
  it("rejects too few sources and malformed PDFs", async () => {
    await expect(mergePdfs([], "Merged")).rejects.toThrow("at least two");
    await expect(mergePdfs([await pdf([100]), new ArrayBuffer(0)], "Merged")).rejects.toThrow();
  });
  it("normalizes filenames without adding a second extension", () => {
    expect(pdfFilename(" Report.PDF ")).toBe("Report.PDF");
    expect(pdfFilename("Report")).toBe("Report.pdf");
    expect(() => pdfFilename(" ")).toThrow();
  });
});
