# Security Documentation

## Token Storage

### Storage Backends

The CacheGPT CLI uses a hierarchical approach for secure token storage:

1. **OS Credential Vaults** (Primary)
   - **macOS**: Keychain Services
   - **Windows**: Credential Manager
   - **Linux**: Secret Service API (GNOME Keyring/KWallet)

2. **Encrypted File Storage** (Fallback)
   - Location: `~/.cachegpt/tokens.json.enc`
   - Encryption: AES-256-GCM
   - Key Derivation: PBKDF2 with 100,000 iterations
   - Machine-bound: Keys derived from hostname + homedir + platform

### File Permissions

- Unix systems: Files created with mode 0600 (owner read/write only)
- Windows: NTFS ACLs restrict access to current user only
- Configuration directory: Mode 0700 on Unix

## Authentication Flow Security

### PKCE (Proof Key for Code Exchange)

- Code verifier: 43-128 characters (cryptographically random)
- Challenge method: SHA256
- State parameter: 32 bytes random (base64url encoded)
- Nonce: 32 bytes random for ID token validation

### Callback Server

- Binds exclusively to `127.0.0.1` (localhost only)
- Uses ephemeral random port
- Single-use: Server stops after first valid callback
- 5-minute timeout for authentication
- Strict state validation to prevent CSRF

### Token Validation

- ID tokens validated using JWKS from issuer
- Signature verification with RS256
- Claims validated: iss, aud, exp, nbf, iat
- Clock skew tolerance: 120 seconds
- Nonce validation for PKCE flows

## Secret Redaction

All logs and error messages are processed through redaction filters:

### Redacted Patterns

- Access tokens
- Refresh tokens
- ID tokens
- Authorization codes
- Client secrets
- API keys
- Bearer tokens in headers
- Passwords

### Redaction Format

- Tokens > 8 chars: Show first 4 and last 4 characters only
- Tokens ≤ 8 chars: Complete redaction `[REDACTED]`
- Email addresses: Show first 2 chars + domain

## Token Lifecycle

### Refresh Strategy

- Proactive refresh when < 120 seconds remain
- Automatic retry with exponential backoff
- Refresh token rotation support
- Graceful degradation on refresh failure

### Revocation

- Tokens revoked on logout (if endpoint available)
- Refresh token revoked first (cascades to access token)
- Local storage cleared regardless of revocation success

## Network Security

### TLS/SSL

- Certificate validation enforced
- Minimum TLS 1.2
- Certificate pinning not implemented (allows proxy inspection)

### Request Security

- All API calls use HTTPS
- Timeouts configured (30s default)
- No credentials in URL parameters
- Bearer tokens in Authorization header only

## Vulnerability Reporting

Report security vulnerabilities to:
- GitHub Security Advisories
- Email: security@cachegpt.app (if available)

Do NOT create public issues for security vulnerabilities.

## Compliance

### Data Protection

- No PII logged by default
- Telemetry opt-in only
- Tokens never persisted in plain text
- No token sharing between accounts

### Audit Trail

- Authentication events logged locally
- Failed auth attempts tracked
- Token refresh events recorded
- Logout events logged

## Rotation and Recovery

### Token Rotation

- Access tokens: Auto-refresh before expiry
- Refresh tokens: Rotated on use (if issuer supports)
- Storage keys: Regenerated on reinstall

### Recovery Procedures

1. **Lost Tokens**: Run `cachegpt logout` then `cachegpt login`
2. **Corrupted Storage**: Delete `~/.cachegpt` directory and re-authenticate
3. **Compromised Tokens**: Immediately run `cachegpt logout` and contact admin

## Security Checklist

### Installation

- [ ] Verify package signatures (if available)
- [ ] Check file permissions after install
- [ ] Review configuration for sensitive data

### Runtime

- [ ] Never share tokens or credentials
- [ ] Use `--device` flag on shared/untrusted systems
- [ ] Logout when finished on shared systems
- [ ] Monitor for unusual authentication patterns

### Development

- [ ] Never commit tokens to version control
- [ ] Use environment variables for sensitive config
- [ ] Enable debug logging only when necessary
- [ ] Review logs for accidental secret exposure