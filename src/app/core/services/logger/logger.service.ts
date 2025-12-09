import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {

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

  info(msg: string, extra?: unknown) {
    console.info(`[${this.getTimestamp()}] ${msg}`, extra ?? '');
  }

  warn(msg: string, extra?: unknown) {
    console.warn(`[${this.getTimestamp()}] ${msg}`, extra ?? '');
  }

  error(msg: string, extra?: unknown) {
    console.error(`[${this.getTimestamp()}] ${msg}`, extra ?? '');
  }
}
