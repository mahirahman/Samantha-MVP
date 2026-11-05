import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";

interface AuthenticatedRequest extends Request {
  userId?: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly supabase: SupabaseClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL");
    const publishableKey = config.get<string>("SUPABASE_PUBLISHABLE_KEY");

    this.supabase = url && publishableKey
      ? createClient(url, publishableKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.supabase) {
      throw new ServiceUnavailableException("Supabase authentication is not configured");
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = typeof authorization === "string"
      ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
      : undefined;

    if (!token) {
      throw new UnauthorizedException("A Supabase access token is required");
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException("The Supabase access token is invalid or expired");
    }

    request.userId = data.user.id;
    return true;
  }
}