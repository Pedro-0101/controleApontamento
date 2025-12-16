import { inject, Injectable } from '@angular/core';
import { LoggerService } from '../logger/logger.service';

@Injectable({
  providedIn: 'root',
})
export class CookiesService {
  private logger = inject(LoggerService);

  constructor() {
    this.logger.info("CookiesService", "Componente inicializado");
  }

  getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      const cookieValue = parts.pop()?.split(';').shift();
      if (cookieValue) {
        return cookieValue;
      }
    }
    return null;
  }

  setCookie(name: string, value: string, days: number) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = date.toUTCString();
    document.cookie = `${name}=${value};expires=${expires};path=/`;
  }

  deleteCookie(name: string) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  }

}
