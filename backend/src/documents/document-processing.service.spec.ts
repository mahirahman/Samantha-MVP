import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { GoogleGenAI } from "@google/genai";
import { DocumentProcessingService } from "./document-processing.service";

jest.mock("@azure/ai-form-recognizer", () => ({
  AzureKeyCredential: jest.fn(),
  DocumentAnalysisClient: jest.fn(),
}));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));

describe("DocumentProcessingService", () => {
  const beginAnalyzeDocument = jest.fn();
  const pollUntilDone = jest.fn();
  const generateContent = jest.fn();
  const file = {
    buffer: Buffer.from("pdf"),
    originalname: "test.pdf",
    mimetype: "application/pdf",
    size: 3,
  };
  let config: Record<string, string>;
  let service: DocumentProcessingService;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    config = {
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.test",
      AZURE_DOCUMENT_INTELLIGENCE_KEY: "test",
      GOOGLE_API_KEY: "test",
    };
    service = new DocumentProcessingService({
      get: (key: string) => config[key],
    } as ConfigService);
    (DocumentAnalysisClient as jest.Mock).mockImplementation(() => ({
      beginAnalyzeDocument,
    }));
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent },
    }));
    beginAnalyzeDocument.mockResolvedValue({ pollUntilDone });
    pollUntilDone.mockResolvedValue({ content: "Test Patient", pages: [] });
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        patientName: " Test Patient ",
        category: "Letter",
      }),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    "AZURE_DOCUMENT_INTELLIGENCE_KEY",
    "GOOGLE_API_KEY",
  ])("reports missing %s", async (key) => {
    delete config[key];
    await expect(service.process(file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it.each(["", "   "])("rejects OCR with no readable text", async (content) => {
    pollUntilDone.mockResolvedValue({ content });
    await expect(service.process(file)).rejects.toThrow("No readable text");
    expect(generateContent).not.toHaveBeenCalled();
  });
  it("maps Azure failures to a gateway error", async () => {
    beginAnalyzeDocument.mockRejectedValue(new Error("network"));
    await expect(service.process(file)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
  it.each([
    ["Letter", "Doctor's Inbox", "Investigations"],
    ["Consent form", "Patient's File", "Correspondence"],
    ["Unknown", "", ""],
  ])(
    "normalizes category %s and filing destination",
    async (category, inbox, store) => {
      generateContent.mockResolvedValue({
        text: JSON.stringify({
          patientName: " Test Patient ",
          category,
          subject: 123,
        }),
      });
      const result = await service.process(file);
      expect(result.extraction).toMatchObject({
        patientName: "Test Patient",
        subject: "",
        inboxType: inbox,
        storeIn: store,
      });
      expect(result.fileName).toBe("test.pdf");
      expect(result.ocrCharacterCount).toBe(12);
    },
  );
  it.each(["", "not json", "[]", "null"])(
    "rejects malformed Gemini output: %s",
    async (text) => {
      generateContent.mockResolvedValue({ text });
      await expect(service.process(file)).rejects.toThrow(
        "Gemini could not extract",
      );
    },
  );
  it.each([
    [401, "invalid or unauthorised"],
    [403, "invalid or unauthorised"],
    [429, "quota or billing"],
    [500, "could not extract"],
  ])("maps Gemini status %s", async (status, message) => {
    generateContent.mockRejectedValue(
      Object.assign(new Error("upstream failure"), { status }),
    );
    await expect(service.process(file)).rejects.toThrow(message);
  });
  it("creates normalized OCR highlight coordinates", async () => {
    pollUntilDone.mockResolvedValue({
      content: "Test Patient",
      pages: [
        {
          pageNumber: 2,
          width: 10,
          height: 20,
          lines: [
            { content: "Test Patient", polygon: [1, 2, 5, 2, 5, 4, 1, 4] },
          ],
        },
      ],
    });
    const result = await service.process(file);
    expect(result.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: "patient",
          pageNumber: 2,
          bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 },
        }),
      ]),
    );
  });
  it("limits the text sent to Gemini without truncating the OCR count", async () => {
    pollUntilDone.mockResolvedValue({
      content: "x".repeat(120_010),
      pages: [],
    });
    expect((await service.process(file)).ocrCharacterCount).toBe(120_010);
    expect(
      generateContent.mock.calls[0][0].contents.endsWith("x".repeat(120_000)),
    ).toBe(true);
    expect(generateContent.mock.calls[0][0].contents).not.toContain(
      "x".repeat(120_001),
    );
  });
  it("requires project and location when Vertex AI is selected", async () => {
    config.GOOGLE_GENAI_USE_VERTEXAI = "true";
    await expect(service.process(file)).rejects.toThrow("project and location");
  });
  it("uses the configured Vertex AI project and model", async () => {
    Object.assign(config, {
      GOOGLE_GENAI_USE_VERTEXAI: "true",
      GOOGLE_CLOUD_PROJECT: "test-project",
      GOOGLE_CLOUD_LOCATION: "test-location",
      GOOGLE_GENAI_MODEL: "test-model",
    });
    await service.process(file);
    expect(GoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: "test-project",
      location: "test-location",
    });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );
  });
});
