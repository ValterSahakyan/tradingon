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

  @Post('verify')
  verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { address?: string },
  ) {
    return this.auth.verify(req, res, body.address || '');
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.clearSession(req, res);
  }
}
