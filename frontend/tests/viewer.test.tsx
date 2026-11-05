import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InteractiveDocumentViewer } from "@/app/dashboard/interactive-document-viewer";
import { getDocument } from "pdfjs-dist";
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));

it("shows PDF loading failures", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getDocument).mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF")) } as ReturnType<typeof getDocument>);
  render(<InteractiveDocumentViewer document={{ id: "doc", name: "Test.pdf", previewUrl: "blob:test" }} activeField={null} onSelectField={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid PDF");
});
it("supports image previews, zoom and normalized highlight selection", async () => {
  const select = vi.fn();
  render(<InteractiveDocumentViewer document={{ id: "image", name: "Test.png", previewUrl: "blob:image", mimeType: "image/png", highlights: [{ id: "hl", fieldName: "patientName", fieldLabel: "Patient", pageNumber: 1, text: "Test Patient", bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } }] }} activeField={null} onSelectField={select} />);
  const image = await screen.findByRole("img");
  expect(image).toHaveAttribute("src", "blob:image");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.getByText("130%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom (100%)" }));
  expect(screen.getByText("100%")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Click to edit Patient Name: "Test Patient"'));
  expect(select).toHaveBeenCalledWith("patient");
  fireEvent.click(screen.getByRole("button", { name: "Hide highlights" }));
  expect(screen.queryByTitle('Click to edit Patient Name: "Test Patient"')).not.toBeInTheDocument();
  expect(getDocument).not.toHaveBeenCalled();
});
