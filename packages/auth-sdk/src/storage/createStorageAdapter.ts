import { StorageAdapter } from './StorageAdapter';
import { KeychainAdapter } from './KeychainAdapter';
import { CredentialManagerAdapter } from './CredentialManagerAdapter';
import { SecretServiceAdapter } from './SecretServiceAdapter';
import { EncryptedFileAdapter } from './EncryptedFileAdapter';

export async function createStorageAdapter(): Promise<StorageAdapter> {
  const adapters: StorageAdapter[] = [];

  // Try OS-specific secure storage first
  switch (process.platform) {
    case 'darwin':
      adapters.push(new KeychainAdapter());
      break;
    case 'win32':
      adapters.push(new CredentialManagerAdapter());
      break;
    case 'linux':
      adapters.push(new SecretServiceAdapter());
      break;
  }

  // Always add encrypted file as fallback
  adapters.push(new EncryptedFileAdapter());

  // Try each adapter in order
  for (const adapter of adapters) {
    try {
      if (await adapter.isAvailable()) {
        await adapter.initialize();
        return adapter;
      }
    } catch (error) {
      // Continue to next adapter
      console.warn(`Storage adapter ${adapter.getBackendName()} not available:`, error);
    }
  }

  // This should never happen as EncryptedFileAdapter is always available
  throw new Error('No storage adapter available');
}