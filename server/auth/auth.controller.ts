import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('session')
  getSession(@Req() req: Request) {
    return this.auth.getSessionStatus(req);
  }

  @Post('challenge')
  createChallenge(
    @Req() req: Request,
    @Body() body: { address?: string; chainId?: number | null; domain?: string; origin?: string },
  ) {
    return this.auth.createChallenge(
      body.address || '',
      body.chainId ?? null,
      body.domain || req.hostname,
      body.origin || `${req.protocol}://${req.get('host') || req.hostname}`,
    );
  }

  @Post('verify')
  verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { address?: string; nonce?: string; signature?: string },
  ) {
    return this.auth.verifyChallenge(
      req,
      res,
      body.address || '',
      body.nonce || '',
      body.signature || '',
    );
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.clearSession(req, res);
  }
}
