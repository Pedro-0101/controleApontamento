import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {

  private colorInfo = 'oklch(0.7 0.2 260)';
  private colorWarn = 'oklch(0.7 0.2 100)';
  private colorError = 'oklch(0.7 0.2 30)';
  private colorMuted = '#888888';
  private colorText = '#000'
  private padEndSize = 32;


  private getTimestamp(): string {
    const now = new Date();
    return now.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  info(source: string, msg: string, extra?: unknown) {
    const timestamp = this.getTimestamp();
    const sourceFormatted = `[${source}]:`.padEnd(this.padEndSize);
    console.info(
      `%c[${timestamp}] %c${sourceFormatted}%c ${msg}`,
      `color: ${this.colorMuted};`,
      `color: ${this.colorInfo}; font-weight: bold;`,
      `color: ${this.colorText};`,
      extra ?? ''
    );
  }

  warn(source: string, msg: string, extra?: unknown) {
    const timestamp = this.getTimestamp();
    const sourceFormatted = `[${source}]:`.padEnd(this.padEndSize);
    console.log(
      `%c[${timestamp}] %c${sourceFormatted}%c ${msg}`,
      `color: ${this.colorMuted};`,
      `color: ${this.colorWarn}; font-weight: bold;`,
      `color: ${this.colorText};`,
      extra ?? ''
    );
  }

  error(source: string, msg: string, extra?: unknown) {
    const timestamp = this.getTimestamp();
    const sourceFormatted = `[${source}]:`.padEnd(this.padEndSize);
    console.log(
      `%c[${timestamp}] %c${sourceFormatted}%c ${msg}`,
      `color: ${this.colorMuted};`,
      `color: ${this.colorError}; font-weight: bold;`,
      `color: ${this.colorText};`,
      extra ?? ''
    );
  }
}
