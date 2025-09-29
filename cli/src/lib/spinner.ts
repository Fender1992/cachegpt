// Optional spinner wrapper - falls back to simple console.log if ora is not available
import chalk from 'chalk';

interface Spinner {
  start(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  warn(text?: string): Spinner;
  info(text?: string): Spinner;
  stop(): Spinner;
  clear(): Spinner;
  text: string;
  isSpinning: boolean;
}

class FallbackSpinner implements Spinner {
  text: string;
  isSpinning: boolean = false;
  private startText: string;

  constructor(text: string) {
    this.text = text;
    this.startText = text;
  }

  start(): Spinner {
    this.isSpinning = true;
    console.log(chalk.cyan('⏳'), this.text);
    return this;
  }

  succeed(text?: string): Spinner {
    this.isSpinning = false;
    console.log(chalk.green('✓'), text || this.text);
    return this;
  }

  fail(text?: string): Spinner {
    this.isSpinning = false;
    console.log(chalk.red('✗'), text || this.text);
    return this;
  }

  warn(text?: string): Spinner {
    this.isSpinning = false;
    console.log(chalk.yellow('⚠'), text || this.text);
    return this;
  }

  info(text?: string): Spinner {
    this.isSpinning = false;
    console.log(chalk.blue('ℹ'), text || this.text);
    return this;
  }

  stop(): Spinner {
    this.isSpinning = false;
    return this;
  }

  clear(): Spinner {
    return this;
  }
}

let ora: any;
try {
  ora = require('ora');
} catch (e) {
  // ora is optional, use fallback
}

export function createSpinner(text: string): Spinner {
  if (ora) {
    return ora(text);
  }
  return new FallbackSpinner(text);
}