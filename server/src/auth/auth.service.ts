import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly accessTokenTtl = '15m';
  private readonly refreshTokenTtlDays = 7;
  private readonly refreshSecret: string;

  constructor(
    private readonly usersService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET or JWT_SECRET is missing');
    }
    this.refreshSecret = refreshSecret;
  }

  private issueAccessToken(user: { id: number; email: string; displayName?: string }) {
    const payload: Record<string, string | number> = {
      sub: user.id,
      email: user.email,
      username: user.email,
      displayName: user.displayName ?? user.email,
      tokenType: 'access',
    };
    return this.jwtService.sign(payload, { expiresIn: this.accessTokenTtl });
  }

  private issueRefreshToken(user: { id: number; email: string }) {
    const payload: Record<string, string | number> = {
      sub: user.id,
      email: user.email,
      tokenType: 'refresh',
    };
    return this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: `${this.refreshTokenTtlDays}d`,
    });
  }

  private tokenResponse(user: { id: number; email: string; displayName?: string }) {
    const access_token = this.issueAccessToken(user);
    const refresh_token = this.issueRefreshToken(user);
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.email,
      },
    };
  }

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  async login(email: string, pass: string) {
    const user = await this.validateUser(email, pass);
    const tokens = this.tokenResponse(user);
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.usersService.setRefreshToken(user.id, tokens.refresh_token, refreshExpiresAt);
    return tokens;
  }

  async register(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const user = await this.usersService.create(dto);
    const identity = user as { id: number; email: string; displayName?: string };
    const tokens = this.tokenResponse(identity);
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.usersService.setRefreshToken(identity.id, tokens.refresh_token, refreshExpiresAt);
    return tokens;
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }
    let payload: { sub?: number; email?: string; tokenType?: string };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (!payload?.sub || payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const isValid = await this.usersService.validateRefreshToken(payload.sub, refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const user = await this.usersService.findByIdRaw(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = this.tokenResponse(user);
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.usersService.setRefreshToken(user.id, tokens.refresh_token, refreshExpiresAt);
    return tokens;
  }

  async logout(userId: number) {
    await this.usersService.clearRefreshToken(userId);
    return { success: true };
  }
}
