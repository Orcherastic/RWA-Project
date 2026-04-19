import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UserService,
      | 'findByEmail'
      | 'create'
      | 'setRefreshToken'
      | 'validateRefreshToken'
      | 'findByIdRaw'
      | 'clearRefreshToken'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      setRefreshToken: jest.fn(),
      validateRefreshToken: jest.fn(),
      findByIdRaw: jest.fn(),
      clearRefreshToken: jest.fn(),
    };

    jwtService = {
      sign: jest.fn((payload: any) =>
        payload.tokenType === 'refresh' ? 'refresh-token' : 'access-token',
      ),
      verify: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        if (key === 'JWT_SECRET') return 'access-secret';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      usersService as unknown as UserService,
      jwtService as unknown as JwtService,
      configService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('login returns both access and refresh tokens and persists refresh hash', async () => {
    const passwordHash = await bcrypt.hash('pass1234', 10);
    usersService.findByEmail.mockResolvedValue({
      id: 7,
      email: 'user@test.com',
      displayName: 'User',
      password: passwordHash,
    } as any);
    usersService.setRefreshToken.mockResolvedValue(undefined as any);

    const result = await service.login('user@test.com', 'pass1234');

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(usersService.setRefreshToken).toHaveBeenCalledWith(
      7,
      'refresh-token',
      expect.any(Date),
    );
  });

  it('refresh rotates tokens when refresh token is valid', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'user@test.com',
      tokenType: 'refresh',
    } as any);
    usersService.validateRefreshToken.mockResolvedValue(true as any);
    usersService.findByIdRaw.mockResolvedValue({
      id: 7,
      email: 'user@test.com',
      displayName: 'User',
    } as any);
    usersService.setRefreshToken.mockResolvedValue(undefined as any);

    const result = await service.refresh('existing-refresh-token');

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(usersService.setRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('register rejects duplicate email', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 1 } as any);

    await expect(
      service.register({
        email: 'used@test.com',
        password: 'secret12',
        displayName: 'Taken',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('logout clears refresh token for that user', async () => {
    usersService.clearRefreshToken.mockResolvedValue(undefined as any);

    const result = await service.logout(7);

    expect(usersService.clearRefreshToken).toHaveBeenCalledWith(7);
    expect(result).toEqual({ success: true });
  });

  it('refresh fails for invalid refresh token', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('bad token');
    });

    await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
