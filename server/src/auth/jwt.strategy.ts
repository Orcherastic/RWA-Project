import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET is missing');
    }
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 8);
    console.log('JWT verify secret', { secretHash });
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: JwtPayload) {
    // be flexible: token may include username or email
    const email = payload.email ?? payload.username;
    const displayName = payload.displayName ?? payload.username ?? email ?? '';

    if (!payload.sub) {
      // malformed token payload
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      userId: payload.sub,
      email,
      displayName,
    };
  }
}
