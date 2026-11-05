import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAuthGuard } from "./supabase-auth.guard";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));

describe("SupabaseAuthGuard", () => {
  const getUser = jest.fn();
  function setup(authorization?: string, configured = true) {
    (createClient as jest.Mock).mockReturnValue({ auth: { getUser } });
    const config = {
      get: () => (configured ? "configured" : undefined),
    } as unknown as ConfigService;
    const request = {
      headers: { authorization },
      userId: undefined as string | undefined,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { guard: new SupabaseAuthGuard(config), request, context };
  }
  beforeEach(() => jest.clearAllMocks());

  it("rejects missing configuration", async () => {
    const { guard, context } = setup("Bearer token", false);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it.each([undefined, "", "Basic token", "Bearer "])(
    "rejects invalid authorization: %s",
    async (header) => {
      const { guard, context } = setup(header);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(getUser).not.toHaveBeenCalled();
    },
  );
  it("attaches the authenticated user and accepts a case-insensitive bearer prefix", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const { guard, context, request } = setup("bearer access-token");
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getUser).toHaveBeenCalledWith("access-token");
    expect(request.userId).toBe("user-1");
  });
  it.each([true, false])(
    "rejects expired or missing users (error=%s)",
    async (error) => {
      getUser.mockResolvedValue({
        data: { user: null },
        error: error ? new Error("expired") : null,
      });
      const { guard, context } = setup("Bearer expired");
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );
});
