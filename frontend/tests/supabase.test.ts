import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ auth: {} })) }));
beforeEach(() => vi.resetModules());
it("requires public Supabase configuration", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  const { getSupabaseClient } = await import("@/lib/supabase");
  expect(() => getSupabaseClient()).toThrow("Supabase is not configured");
});
it("reuses a single browser client", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  const { getSupabaseClient } = await import("@/lib/supabase");
  expect(getSupabaseClient()).toBe(getSupabaseClient());
  expect(createClient).toHaveBeenCalledTimes(1);
});
