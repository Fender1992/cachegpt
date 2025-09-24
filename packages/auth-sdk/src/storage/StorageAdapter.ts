import { TokenSet } from '../types';

export abstract class StorageAdapter {
  abstract initialize(): Promise<void>;
  abstract saveTokens(tokens: TokenSet): Promise<void>;
  abstract getTokens(): Promise<TokenSet | null>;
  abstract clearTokens(): Promise<void>;
  abstract getBackendName(): string;
  abstract isAvailable(): Promise<boolean>;
}