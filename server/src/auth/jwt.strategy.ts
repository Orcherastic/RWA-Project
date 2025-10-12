import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'yourSecretKey',
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
