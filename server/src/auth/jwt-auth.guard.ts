import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    if (err || !user) {
      const infoMsg =
        typeof info === 'string'
          ? info
          : (info as { message?: string } | undefined)?.message;
      throw err instanceof Error ? err : new UnauthorizedException(infoMsg ?? 'Unauthorized');
    }
    return user;
  }
}
