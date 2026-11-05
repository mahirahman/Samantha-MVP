import { beforeEach, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";
import { processDocumentFile } from "@/lib/document-processing";
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const getSession = vi.fn();
const fetchMock = vi.fn();
const file = new File(["test"], "Test.pdf", { type: "application/pdf" });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/");
  getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
  vi.mocked(getSupabaseClient).mockReturnValue({ auth: { getSession } } as unknown as ReturnType<typeof getSupabaseClient>);
  vi.stubGlobal("fetch", fetchMock);
});
it("sends authenticated multipart data and normalizes incomplete responses", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ extraction: { patientName: "Test", subject: 12, inboxType: "invalid" }, highlights: [null, { fieldName: "patient", bbox: { x: 0.5 } }] }) });
  const result = await processDocumentFile(file);
  expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/documents/process", expect.objectContaining({ headers: { Authorization: "Bearer test-token" }, body: expect.any(FormData) }));
  expect(result.extraction).toMatchObject({ patientName: "Test", subject: "", inboxType: "", storeIn: "" });
  expect(result.highlights).toHaveLength(1);
  expect(result.highlights?.[0].bbox).toEqual({ x: 0.5, y: 0, width: 0, height: 0 });
});
it("requires configuration and an active session before making a request", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  await expect(processDocumentFile(file)).rejects.toThrow("not configured");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(processDocumentFile(file)).rejects.toThrow("Sign in again");
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([[{ message: "Unavailable" }, "Unavailable"], [{ message: ["Bad file", "Try again"] }, "Bad file, Try again"], [null, "(500)"]])("reports API errors", async (payload, message) => {
  fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => payload });
  await expect(processDocumentFile(file)).rejects.toThrow(message);
});
it("reports non-JSON server errors and network failures", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("HTML"); } });
  await expect(processDocumentFile(file)).rejects.toThrow("502");
  fetchMock.mockRejectedValue(new Error("offline"));
  await expect(processDocumentFile(file)).rejects.toThrow("offline");
});
