export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
  expires_at?: number;
  scope?: string;
}

export interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

export interface IssuerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  device_authorization_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface PKCEParams {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  nonce: string;
}

export interface TokenClientConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  storageAdapter?: import('./storage/StorageAdapter').StorageAdapter;
  logger?: Logger;
  httpTimeout?: number;
  clockSkew?: number;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export type AuthMethod = 'pkce' | 'device_code';

export interface AuthResult {
  method: AuthMethod;
  tokens: TokenSet;
  userInfo?: UserInfo;
}