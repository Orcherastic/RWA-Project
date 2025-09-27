export interface LoginRequest {
  email: string;
  password: string;
}
export interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
}
export interface AuthResponse {
  access_token: string;
  user?: {
    id?: number;
    email: string;
    displayName?: string;
  };
}