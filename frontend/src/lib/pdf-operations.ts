import { PDFDocument } from "pdf-lib";

export interface SplitRange { name: string; start: number; end: number }

export function validateSplitRanges(ranges: SplitRange[], pageCount: number): void {
  if (ranges.length < 2) throw new Error("Choose at least two output documents.");
  const used = new Set<number>();
  for (const range of ranges) {
    if (!range.name.trim()) throw new Error("Give each document a filename.");
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 1 || range.end > pageCount || range.start > range.end) {
      throw new Error(`Page ranges must be between 1 and ${pageCount}.`);
    }
    for (let page = range.start; page <= range.end; page++) {
      if (used.has(page)) throw new Error(`Page ${page} appears in more than one range.`);
      used.add(page);
    }
  }
  if (used.size !== pageCount) throw new Error("Include every page exactly once before splitting.");
}

export async function splitPdf(bytes: ArrayBuffer, ranges: SplitRange[]): Promise<File[]> {
  const source = await PDFDocument.load(bytes);
  validateSplitRanges(ranges, source.getPageCount());
  return Promise.all(ranges.map(async (range) => {
    const output = await PDFDocument.create();
    const indices = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start - 1 + i);
    for (const page of await output.copyPages(source, indices)) output.addPage(page);
    return new File([new Uint8Array(await output.save())], pdfFilename(range.name), { type: "application/pdf" });
  }));
}

export function pdfFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter an output filename.");
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

export async function mergePdfs(sources: ArrayBuffer[], name: string): Promise<File> {
  if (sources.length < 2) throw new Error("Select at least two PDFs to merge.");
  const output = await PDFDocument.create();
  for (const bytes of sources) {
    const source = await PDFDocument.load(bytes);
    for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
  }
  return new File([new Uint8Array(await output.save())], pdfFilename(name), { type: "application/pdf" });
}

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}
