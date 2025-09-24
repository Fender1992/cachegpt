# Troubleshooting Guide

## Common Issues

### Authentication Issues

#### "Failed to open browser"

**Problem**: The CLI cannot open your default browser for authentication.

**Solutions**:
1. Use device code flow: `cachegpt login --device`
2. Set default browser:
   - **macOS**: System Preferences → General → Default web browser
   - **Windows**: Settings → Apps → Default apps → Web browser
   - **Linux**: `xdg-settings set default-web-browser firefox.desktop`

#### "Authentication timeout"

**Problem**: The authentication process took too long (> 5 minutes).

**Solutions**:
1. Ensure you complete the browser flow within 5 minutes
2. Check your internet connection
3. Try again with `cachegpt login`

#### "State mismatch - possible CSRF attack"

**Problem**: Security validation failed during OAuth callback.

**Solutions**:
1. Ensure you're not using a proxy that modifies requests
2. Clear browser cookies and try again
3. Check that your system clock is accurate

### Network Issues

#### "Failed to discover OIDC metadata"

**Problem**: Cannot reach the authentication server.

**Solutions**:
1. Check internet connectivity: `ping cachegpt.app`
2. Check DNS resolution: `nslookup cachegpt.app`
3. Verify proxy settings if behind corporate firewall
4. Try with explicit timeout: `CACHEGPT_TIMEOUT=60000 cachegpt login`

#### "Certificate validation failed"

**Problem**: TLS/SSL certificate issues.

**Solutions**:
1. Update system certificates:
   - **macOS**: `brew install ca-certificates`
   - **Ubuntu/Debian**: `sudo apt-get update && sudo apt-get install ca-certificates`
   - **RHEL/CentOS**: `sudo yum install ca-certificates`
2. Check system time (must be accurate for cert validation)
3. If behind proxy, configure proxy certificates

### Storage Issues

#### "Keychain/Credential Manager not available"

**Problem**: OS credential vault cannot be accessed.

**Solutions**:

**macOS Keychain**:
1. Unlock Keychain: `security unlock-keychain`
2. Reset Keychain permissions: Keychain Access → Preferences → Reset My Default Keychains
3. Fall back to encrypted file: Will happen automatically

**Windows Credential Manager**:
1. Run as administrator: `runas /user:Administrator cmd`
2. Check Windows Credential Manager service is running
3. Clear corrupted entries: `cmdkey /list` and `cmdkey /delete:CacheGPT`

**Linux Secret Service**:
1. Install secret service provider:
   ```bash
   # GNOME
   sudo apt-get install gnome-keyring

   # KDE
   sudo apt-get install kwalletmanager
   ```
2. Ensure D-Bus session is running: `echo $DBUS_SESSION_BUS_ADDRESS`
3. Unlock keyring: `gnome-keyring-daemon --unlock`

#### "Permission denied" on token file

**Problem**: Cannot read/write encrypted token file.

**Solutions**:
1. Check permissions: `ls -la ~/.cachegpt/`
2. Fix permissions: `chmod 700 ~/.cachegpt && chmod 600 ~/.cachegpt/tokens.json.enc`
3. Check disk space: `df -h ~`
4. Remove corrupted file: `rm -rf ~/.cachegpt/tokens.json.enc`

### Token Issues

#### "Token expired"

**Problem**: Access token has expired and refresh failed.

**Solutions**:
1. Re-authenticate: `cachegpt logout && cachegpt login`
2. Check system time is correct
3. Verify refresh token hasn't been revoked

#### "Clock skew detected"

**Problem**: System time differs significantly from server time.

**Solutions**:

**All Systems**:
1. Sync time with NTP server

**macOS**:
```bash
sudo sntp -sS time.apple.com
```

**Linux**:
```bash
sudo ntpdate -s time.nist.gov
# or
sudo timedatectl set-ntp true
```

**Windows**:
```powershell
w32tm /resync
```

### Platform-Specific Issues

#### WSL (Windows Subsystem for Linux)

**Browser Opening**:
```bash
# Set browser for WSL
export BROWSER="/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
# or
export BROWSER="wslview"
```

**Keyring Access**:
- Secret Service doesn't work in WSL1
- Use WSL2 or fallback to encrypted file storage

#### SSH/Remote Sessions

**No Display**:
1. Use device code flow: `cachegpt login --device`
2. Forward X11 if possible: `ssh -X user@host`
3. Set up SSH tunnel for callback:
   ```bash
   # On local machine
   ssh -R 8080:localhost:8080 user@remote
   # On remote, set callback port
   export CACHEGPT_CALLBACK_PORT=8080
   ```

#### Docker/Containers

**No Browser Access**:
1. Use device code flow: `cachegpt login --device`
2. Mount credentials:
   ```bash
   docker run -v ~/.cachegpt:/root/.cachegpt myapp
   ```

### Diagnostics

Run full diagnostics to identify issues:
```bash
cachegpt diag
```

Enable verbose logging:
```bash
cachegpt login --verbose
# or
export DEBUG=1
cachegpt login
```

Check configuration:
```bash
cachegpt status
```

### Getting Help

1. Run diagnostics: `cachegpt diag`
2. Check verbose logs: `DEBUG=1 cachegpt login --verbose 2> debug.log`
3. Review this guide
4. Search existing issues on GitHub
5. Create new issue with:
   - OS and version
   - CLI version: `cachegpt --version`
   - Diagnostic output
   - Redacted debug logs

### Environment Variables

Control CLI behavior with these environment variables:

```bash
# API Configuration
export CACHEGPT_ISSUER_URL=https://cachegpt.app
export CACHEGPT_CLIENT_ID=cachegpt-cli
export CACHEGPT_API_URL=https://cachegpt.app/api

# Timeouts (milliseconds)
export CACHEGPT_TIMEOUT=30000

# Debugging
export DEBUG=1

# Proxy (if needed)
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1
```