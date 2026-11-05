import { BadRequestException } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import {
  DocumentProcessingService,
  UploadedDocument,
} from "./document-processing.service";

describe("DocumentsController", () => {
  const process = jest.fn();
  const controller = new DocumentsController({
    process,
  } as unknown as DocumentProcessingService);
  beforeEach(() => process.mockReset());
  it.each([undefined, { buffer: Buffer.alloc(0) }])(
    "rejects a missing or empty upload",
    (file) => {
      expect(() =>
        controller.processDocument(file as UploadedDocument),
      ).toThrow(BadRequestException);
      expect(process).not.toHaveBeenCalled();
    },
  );
  it("passes the uploaded bytes to processing and returns the result", async () => {
    const file = {
      buffer: Buffer.from("pdf"),
      originalname: "document.pdf",
      mimetype: "application/pdf",
      size: 3,
    };
    process.mockResolvedValue({ fileName: file.originalname });
    await expect(controller.processDocument(file)).resolves.toEqual({
      fileName: file.originalname,
    });
    expect(process).toHaveBeenCalledWith(file);
  });
  it("propagates processing failures", async () => {
    process.mockRejectedValue(new Error("OCR unavailable"));
    await expect(
      controller.processDocument({
        buffer: Buffer.from("pdf"),
      } as UploadedDocument),
    ).rejects.toThrow("OCR unavailable");
  });
});
