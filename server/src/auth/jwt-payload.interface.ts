export interface JwtPayload {
  sub: number;
  email?: string;
  username?: string;
  displayName?: string;
  tokenType?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
