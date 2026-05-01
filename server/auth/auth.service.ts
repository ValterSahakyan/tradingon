import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { WalletSessionPayload } from './auth.types';

const SESSION_COOKIE = 'dashboard_session';
const DEFAULT_SESSION_TTL_HOURS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.getAllowedWallet());
  }

  getAllowedWallet(): string | null {
    const value = this.config.get<string>('auth.allowedWallet')?.trim();
    return value ? value.toLowerCase() : null;
  }

  getSessionTtlHours(): number {
    return this.config.get<number>('auth.sessionTtlHours') || DEFAULT_SESSION_TTL_HOURS;
  }

  getSessionStatus(req: Request) {
    const allowedWallet = this.getAllowedWallet();
    const session = this.readSession(req);
    return {
      authEnabled: this.isEnabled(),
      authenticated: Boolean(session),
      address: session?.sub ?? null,
      allowedWallet,
    };
  }

  verify(req: Request, res: Response, address: string) {
    if (!address) {
      throw new ForbiddenException('No wallet address provided');
    }

    if (!this.isEnabled()) {
      return { authEnabled: false, authenticated: true, address: null };
    }

    const normalised = address.toLowerCase().trim();
    const allowed = this.getAllowedWallet();

    if (!allowed || normalised !== allowed) {
      throw new ForbiddenException('This wallet is not allowed to access the dashboard');
    }

    const token = this.signSession(normalised);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(req),
      maxAge: this.getSessionTtlHours() * 3600_000,
      path: '/',
    });

    this.logger.log(`Dashboard login granted for ${normalised}`);

    return { authEnabled: true, authenticated: true, address: normalised, allowedWallet: allowed };
  }

  clearSession(req: Request, res: Response) {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(req),
      path: '/',
    });
    return { ok: true };
  }

  assertAuthenticated(req: Request): WalletSessionPayload | null {
    if (!this.isEnabled()) {
      return null;
    }
    const session = this.readSession(req);
    if (!session) {
      throw new UnauthorizedException('Wallet authentication required');
    }
    return session;
  }

  private readSession(req: Request): WalletSessionPayload | null {
    if (!this.isEnabled()) {
      return null;
    }
    const token = this.getCookie(req, SESSION_COOKIE);
    if (!token) {
      return null;
    }
    const payload = this.verifySessionToken(token);
    if (!payload) {
      return null;
    }
    const allowed = this.getAllowedWallet();
    if (!allowed || payload.sub.toLowerCase() !== allowed) {
      return null;
    }
    return payload;
  }

  private signSession(address: string): string {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.getSessionTtlHours() * 3600;
    const payload: WalletSessionPayload = { sub: address, iat, exp };
    const encodedPayload = this.toBase64Url(JSON.stringify(payload));
    const signature = this.createSignature(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  private verifySessionToken(token: string): WalletSessionPayload | null {
    const [encodedPayload, encodedSignature] = token.split('.');
    if (!encodedPayload || !encodedSignature) {
      return null;
    }
    const expectedSignature = this.createSignature(encodedPayload);
    const actual = Buffer.from(encodedSignature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    try {
      const payload = JSON.parse(this.fromBase64Url(encodedPayload)) as WalletSessionPayload;
      if (!payload?.sub || !payload?.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private createSignature(value: string): string {
    const secret = this.getSessionSecret();
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private getSessionSecret(): string {
    const value = this.config.get<string>('auth.sessionSecret')?.trim();
    if (value) return value;
    // Fall back to a deterministic secret derived from the allowed wallet
    // so auth works even without DASHBOARD_AUTH_SECRET configured.
    const wallet = this.getAllowedWallet() ?? 'no-wallet';
    return createHmac('sha256', 'tradingon-fallback').update(wallet).digest('hex');
  }

  private getCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rawValue] = part.trim().split('=');
      if (rawKey === name) {
        return decodeURIComponent(rawValue.join('='));
      }
    }
    return null;
  }

  private isSecureRequest(req: Request): boolean {
    return req.secure || req.headers['x-forwarded-proto'] === 'https';
  }

  private toBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private fromBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
