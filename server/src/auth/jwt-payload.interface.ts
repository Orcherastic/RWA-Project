export interface JwtPayload {
  sub: number;
  email?: string;
  username?: string;
  displayName?: string;
  iat?: number;
  exp?: number;
}
