export const RedactionPatterns = {
  ACCESS_TOKEN: /(\baccess_token["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  REFRESH_TOKEN: /(\brefresh_token["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  ID_TOKEN: /(\bid_token["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  AUTH_CODE: /(\bcode["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  CLIENT_SECRET: /(\bclient_secret["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  API_KEY: /(\bapi_key["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
  AUTHORIZATION: /(\bAuthorization["\s]*[:=]\s*["']?Bearer\s+)([^"'\s]+)/gi,
  PASSWORD: /(\bpassword["\s]*[:=]\s*["']?)([^"'\s&]+)/gi,
};

export function redactSecrets(input: string): string {
  let redacted = input;

  // Redact tokens and secrets
  for (const [key, pattern] of Object.entries(RedactionPatterns)) {
    redacted = redacted.replace(pattern, (match, prefix, secret) => {
      if (secret.length <= 8) {
        return `${prefix}[REDACTED]`;
      }
      // Show first 4 and last 4 characters for debugging
      const start = secret.substring(0, 4);
      const end = secret.substring(secret.length - 4);
      return `${prefix}${start}...[REDACTED]...${end}`;
    });
  }

  // Redact email addresses (partial)
  redacted = redacted.replace(
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (match, localPart, domain) => {
      if (localPart.length <= 2) {
        return `**@${domain}`;
      }
      return `${localPart.substring(0, 2)}***@${domain}`;
    }
  );

  return redacted;
}

export function redactObject(obj: any): any {
  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item));
  }

  if (obj && typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact entire value for sensitive keys
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('key') ||
        lowerKey === 'authorization'
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactObject(value);
      }
    }
    return redacted;
  }

  return obj;
}