import { exec, spawn } from 'child_process';
import * as util from 'util';
import chalk from 'chalk';

const execPromise = util.promisify(exec);

export interface ShellOperation {
  type: 'execute';
  command: string;
  output?: string;
  error?: string;
  exitCode?: number;
  success?: boolean;
}

/**
 * List of potentially dangerous commands that require extra caution
 * These will be completely blocked for safety
 */
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf /usr',
  'rm -rf /bin',
  'rm -rf /sbin',
  'rm -rf /etc',
  'rm -rf /var',
  'rm -rf /boot',
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  '> /dev/sda',
  '> /dev/hda',
  'format c:',
  'del /f /s /q c:\\*',
  ':(){:|:&};:',  // Fork bomb
  ':(){ :|:& };:',  // Fork bomb variant
];

/**
 * Commands that should show warnings but can still execute
 * These require user awareness but aren't completely blocked
 */
const WARNING_COMMANDS = [
  'shutdown',
  'poweroff',
  'reboot',
  'halt',
  'init 0',
  'init 6',
  'systemctl reboot',
  'systemctl poweroff',
  'systemctl halt',
];

/**
 * Commands that are generally safe and commonly used
 * Comprehensive list including Linux, Docker, system management, etc.
 */
const SAFE_COMMAND_PREFIXES = [
  // File operations
  'ls', 'dir', 'pwd', 'cd', 'cat', 'echo', 'grep', 'egrep', 'fgrep', 'find', 'which', 'whereis',
  'locate', 'file', 'basename', 'dirname', 'realpath', 'readlink',
  'mkdir', 'touch', 'cp', 'mv', 'ln', 'chmod', 'chown', 'chgrp', 'stat',
  'head', 'tail', 'less', 'more', 'wc', 'sort', 'uniq', 'diff', 'patch', 'cut', 'sed', 'awk',

  // Archiving and compression
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', '7z',

  // Network operations
  'curl', 'wget', 'ping', 'traceroute', 'tracert', 'nslookup', 'dig', 'host',
  'netstat', 'ss', 'lsof', 'ifconfig', 'ip', 'route', 'arp', 'hostname',
  'nc', 'telnet', 'ftp', 'sftp', 'ssh', 'scp', 'rsync',

  // Process management
  'ps', 'top', 'htop', 'pgrep', 'pkill', 'kill', 'killall', 'pstree',
  'jobs', 'bg', 'fg', 'nohup', 'screen', 'tmux',

  // System information
  'uname', 'hostname', 'uptime', 'whoami', 'who', 'w', 'id', 'groups',
  'date', 'cal', 'timedatectl', 'localectl',
  'df', 'du', 'free', 'lscpu', 'lsmem', 'lsblk', 'lspci', 'lsusb',
  'dmesg', 'journalctl', 'systemd-analyze',

  // Package managers
  'apt list', 'apt search', 'apt show', 'apt-cache', 'apt-get update', 'apt-get upgrade',
  'yum list', 'yum search', 'yum info', 'dnf list', 'dnf search', 'dnf info',
  'brew list', 'brew search', 'brew info', 'brew update', 'brew upgrade',
  'npm', 'yarn', 'pnpm', 'pip', 'pip3', 'pipenv', 'poetry',
  'gem', 'bundle', 'cargo', 'composer', 'go get', 'go mod',

  // Docker
  'docker', 'docker ps', 'docker images', 'docker logs', 'docker inspect', 'docker stats',
  'docker exec', 'docker run', 'docker pull', 'docker push', 'docker build',
  'docker-compose', 'docker compose', 'docker network', 'docker volume',

  // Kubernetes
  'kubectl', 'kubectl get', 'kubectl describe', 'kubectl logs', 'kubectl exec',
  'helm', 'minikube', 'k9s',

  // System services
  'systemctl', 'systemctl status', 'systemctl list-units', 'systemctl show',
  'service', 'service status', 'service list',

  // Development tools
  'git', 'svn', 'hg', 'make', 'cmake', 'autoconf',
  'gcc', 'g++', 'clang', 'javac', 'java', 'mvn', 'gradle',
  'node', 'deno', 'bun', 'python', 'python3', 'ruby', 'perl', 'php',
  'rustc', 'go', 'dotnet', 'mono',

  // Text editors (view mode)
  'vim -R', 'vi -R', 'nano -v', 'emacs --batch',

  // Database clients (read operations)
  'mysql -e', 'psql -c', 'mongo --eval', 'redis-cli',

  // Cloud CLIs
  'aws', 'az', 'gcloud', 'doctl', 'heroku',

  // Monitoring and logging
  'watch', 'tail -f', 'journalctl -f', 'tcpdump', 'strace', 'ltrace',

  // Testing
  'jest', 'mocha', 'pytest', 'phpunit', 'rspec', 'cargo test',

  // Environment
  'env', 'printenv', 'export', 'set', 'alias', 'unalias',
  'source', '.', 'eval', 'type', 'command',
];

/**
 * Check if a command is potentially dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();

  // Check against known dangerous commands
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCmd.includes(dangerous.toLowerCase())) {
      return true;
    }
  }

  // Check for destructive patterns
  const destructivePatterns = [
    /rm\s+-rf\s+\/(?!home|tmp|var\/tmp)/,  // rm -rf / (excluding safe dirs)
    /rm\s+-rf\s+\*/,  // rm -rf *
    /dd\s+if=\/dev\/(zero|random)/,  // Disk wiping
    />\s*\/dev\/sd[a-z]/,  // Writing to raw disk
    /mkfs/,  // Format filesystem
    /fdisk.*-d/,  // Delete partitions
  ];

  for (const pattern of destructivePatterns) {
    if (pattern.test(lowerCmd)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if command looks safe
 */
export function isSafeCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase();

  // Check if it starts with any safe command prefix
  for (const prefix of SAFE_COMMAND_PREFIXES) {
    if (trimmed.startsWith(prefix.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Check if command requires a warning (but isn't completely blocked)
 */
export function isWarningCommand(command: string): boolean {
  const lowerCmd = command.toLowerCase().trim();

  for (const warning of WARNING_COMMANDS) {
    if (lowerCmd.includes(warning.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Execute a shell command with safety checks
 */
export async function executeCommand(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
  } = {}
): Promise<ShellOperation> {
  // Default options
  const execOptions = {
    cwd: options.cwd || process.cwd(),
    timeout: options.timeout || 30000,  // 30 seconds default
    maxBuffer: options.maxBuffer || 1024 * 1024,  // 1MB
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
  };

  try {
    const { stdout, stderr } = await execPromise(command, execOptions);

    return {
      type: 'execute',
      command,
      output: stdout,
      error: stderr || undefined,
      exitCode: 0,
      success: true
    };
  } catch (error: any) {
    return {
      type: 'execute',
      command,
      output: error.stdout || '',
      error: error.stderr || error.message,
      exitCode: error.code || 1,
      success: false
    };
  }
}

/**
 * Parse AI response for shell commands
 * Looks for:
 * - EXECUTE: command
 * - RUN: command
 * - SHELL: command
 * - ```bash\ncommand\n```
 */
export function parseShellOperations(aiResponse: string): {
  cleanResponse: string;
  operations: Array<{
    command: string;
  }>;
} {
  const operations: Array<{ command: string }> = [];
  let cleanResponse = aiResponse;

  // Pattern 1: EXECUTE: command
  const executePattern = /(?:EXECUTE|RUN|SHELL):\s*(.+?)(?:\n|$)/gi;
  let match;

  while ((match = executePattern.exec(aiResponse)) !== null) {
    operations.push({
      command: match[1].trim()
    });
    cleanResponse = cleanResponse.replace(match[0], '');
  }

  // Pattern 2: ```bash or ```sh code blocks
  const bashPattern = /```(?:bash|sh|shell)\n([\s\S]*?)```/gi;

  while ((match = bashPattern.exec(aiResponse)) !== null) {
    const commands = match[1].trim().split('\n');
    for (const cmd of commands) {
      const trimmed = cmd.trim();
      // Skip comments and empty lines
      if (trimmed && !trimmed.startsWith('#')) {
        operations.push({
          command: trimmed
        });
      }
    }
    cleanResponse = cleanResponse.replace(match[0], '');
  }

  return {
    cleanResponse: cleanResponse.trim(),
    operations
  };
}

/**
 * Format shell operation result for display
 */
export function formatShellResult(op: ShellOperation): string {
  let result = '';

  if (op.success) {
    result += chalk.green(`✓ Executed: ${op.command}\n`);

    if (op.output && op.output.trim()) {
      const lines = op.output.trim().split('\n');
      if (lines.length > 20) {
        // Show first 10 and last 10 lines for long output
        result += chalk.dim('  Output:\n');
        lines.slice(0, 10).forEach(line => {
          result += chalk.gray(`  ${line}\n`);
        });
        result += chalk.dim(`  ... ${lines.length - 20} more lines ...\n`);
        lines.slice(-10).forEach(line => {
          result += chalk.gray(`  ${line}\n`);
        });
      } else {
        result += chalk.dim('  Output:\n');
        lines.forEach(line => {
          result += chalk.gray(`  ${line}\n`);
        });
      }
    } else {
      result += chalk.dim('  (no output)\n');
    }

    if (op.error && op.error.trim()) {
      result += chalk.yellow(`  Warnings:\n`);
      op.error.trim().split('\n').forEach(line => {
        result += chalk.yellow(`  ${line}\n`);
      });
    }
  } else {
    result += chalk.red(`✗ Failed: ${op.command}\n`);
    result += chalk.red(`  Exit code: ${op.exitCode || 'unknown'}\n`);

    if (op.error && op.error.trim()) {
      result += chalk.red('  Error:\n');
      op.error.trim().split('\n').forEach(line => {
        result += chalk.red(`  ${line}\n`);
      });
    }

    if (op.output && op.output.trim()) {
      result += chalk.dim('  Output:\n');
      op.output.trim().split('\n').forEach(line => {
        result += chalk.gray(`  ${line}\n`);
      });
    }
  }

  return result;
}

/**
 * Get safety warning message for a command
 */
export function getSafetyWarning(command: string): string | null {
  if (isDangerousCommand(command)) {
    return `⚠️  DANGER: This command appears dangerous and could harm your system:\n  ${command}\n\n❌ This command will NOT be executed for safety.`;
  }

  if (isWarningCommand(command)) {
    return `⚠️  WARNING: This command will affect system power state:\n  ${command}\n\n⚡ Proceeding with execution...`;
  }

  if (!isSafeCommand(command)) {
    return `ℹ️  INFO: This command is not in the standard safe list:\n  ${command}\n\n✓ Proceeding with execution...`;
  }

  return null;
}
