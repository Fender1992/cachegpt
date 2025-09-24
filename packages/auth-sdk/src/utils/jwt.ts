import { jwtVerify, createRemoteJWKSet, JWTVerifyResult } from 'jose';

export interface TokenValidationOptions {
  issuer?: string;
  audience?: string;
  clockTolerance?: number;
  currentDate?: Date;
}

export async function validateToken(
  token: string,
  jwksUri: string,
  options?: TokenValidationOptions
): Promise<JWTVerifyResult> {
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  return await jwtVerify(token, jwks, {
    issuer: options?.issuer,
    audience: options?.audience,
    clockTolerance: options?.clockTolerance || 120,
    currentDate: options?.currentDate
  });
}