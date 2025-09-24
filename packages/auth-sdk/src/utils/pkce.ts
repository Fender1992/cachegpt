import * as crypto from 'crypto';
import { PKCEParams } from '../types';

export interface PKCEChallenge {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  nonce: string;
}

export async function generatePKCEChallenge(): Promise<PKCEParams> {
  // Generate code verifier (43-128 characters)
  const verifierLength = Math.floor(Math.random() * (128 - 43 + 1)) + 43;
  const verifierBytes = crypto.randomBytes(Math.ceil(verifierLength * 3 / 4));
  const code_verifier = base64UrlEncode(verifierBytes).substring(0, verifierLength);

  // Generate code challenge (SHA256 hash of verifier)
  const challengeBuffer = crypto.createHash('sha256').update(code_verifier).digest();
  const code_challenge = base64UrlEncode(challengeBuffer);

  // Generate state and nonce
  const state = base64UrlEncode(crypto.randomBytes(32));
  const nonce = base64UrlEncode(crypto.randomBytes(32));

  return {
    code_verifier,
    code_challenge,
    code_challenge_method: 'S256',
    state,
    nonce
  };
}

export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}