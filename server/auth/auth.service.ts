import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { ethers } from 'ethers';
import { WalletChallenge, WalletSessionPayload } from './auth.types';

const SESSION_COOKIE = 'dashboard_session';
const CHALLENGE_TTL_MS = 5 * 60_000;
const DEFAULT_SESSION_TTL_HOURS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly challenges = new Map<string, WalletChallenge>();

  constructor(private readonly config: ConfigService) {}

  getSessionCookieName(): string {
    return SESSION_COOKIE;
  }

  isEnabled(): boolean {
    return Boolean(this.getAllowedWallet());
  }

  getAllowedWallet(): string | null {
    const value = this.config.get<string>('auth.allowedWallet')?.trim();
    return value ? ethers.utils.getAddress(value) : null;
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

  createChallenge(address: string, chainId: number | null, domain: string, origin: string) {
    if (!this.isEnabled()) {
      return {
        authEnabled: false,
        message: null,
        nonce: null,
        expiresAt: null,
      };
    }

    const checksumAddress = this.normalizeAddress(address);
    const allowedWallet = this.getAllowedWallet();
    if (!allowedWallet || checksumAddress !== allowedWallet) {
      throw new ForbiddenException('This wallet is not allowed to access the dashboard');
    }

    this.pruneChallenges();

    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    const expirationTime = new Date(expiresAt).toISOString();
    const safeOrigin = origin || `https://${domain}`;
    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      checksumAddress,
      '',
      'TradingOn dashboard access',
      '',
      `URI: ${safeOrigin}`,
      'Version: 1',
      `Chain ID: ${chainId ?? 1}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expirationTime}`,
    ].join('\n');

    this.challenges.set(nonce, {
      nonce,
      address: checksumAddress,
      chainId,
      message,
      expiresAt,
    });

    return {
      authEnabled: true,
      message,
      nonce,
      expiresAt,
      allowedWallet,
    };
  }

  verifyChallenge(
    req: Request,
    res: Response,
    address: string,
    nonce: string,
    signature: string,
  ) {
    if (!this.isEnabled()) {
      return {
        authEnabled: false,
        authenticated: true,
        address: null,
      };
    }

    const challenge = this.challenges.get(nonce);
    if (!challenge) {
      throw new UnauthorizedException('Challenge expired or not found');
    }

    this.challenges.delete(nonce);

    if (challenge.expiresAt < Date.now()) {
      throw new UnauthorizedException('Challenge expired');
    }

    const checksumAddress = this.normalizeAddress(address);
    if (checksumAddress !== challenge.address) {
      throw new UnauthorizedException('Challenge address mismatch');
    }

    let recovered: string;
    try {
      recovered = ethers.utils.verifyMessage(challenge.message, signature);
    } catch {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    if (ethers.utils.getAddress(recovered) !== checksumAddress) {
      throw new UnauthorizedException('Signature verification failed');
    }

    const token = this.signSession(checksumAddress);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.isSecureRequest(req),
      maxAge: this.getSessionTtlHours() * 3600_000,
      path: '/',
    });

    this.logger.log(`Dashboard login granted for ${checksumAddress}`);

    return {
      authEnabled: true,
      authenticated: true,
      address: checksumAddress,
      allowedWallet: this.getAllowedWallet(),
    };
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

    const allowedWallet = this.getAllowedWallet();
    if (!allowedWallet || ethers.utils.getAddress(payload.sub) !== allowedWallet) {
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
    if (!value) {
      throw new UnauthorizedException('Dashboard auth is misconfigured');
    }
    return value;
  }

  private normalizeAddress(address: string): string {
    try {
      return ethers.utils.getAddress(address);
    } catch {
      throw new BadRequestException('Invalid wallet address');
    }
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
    return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  }

  private pruneChallenges(): void {
    const now = Date.now();
    for (const [nonce, challenge] of this.challenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(nonce);
      }
    }
  }

  private toBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private fromBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
