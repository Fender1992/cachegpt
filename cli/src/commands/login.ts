#!/usr/bin/env node

export async function loginCommand() {
  // Import and use the simple code version by default
  const { loginSimpleCodeCommand } = await import('./login-simple-code');
  return loginSimpleCodeCommand();
}