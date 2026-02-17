export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  organizationId?: string;
}

export interface JwtResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId?: string;
  };
}