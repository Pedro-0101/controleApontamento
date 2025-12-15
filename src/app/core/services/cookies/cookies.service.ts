import { inject, Injectable } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { CookieModel } from '../../../models/cookie/cookie.model';

@Injectable({
  providedIn: 'root',
})
export class CookiesService {
  private logger = inject(LoggerService);

  constructor() {
    this.logger.info("[CookiesService] - CookiesService inicializado");
  }

  getCookie(name: string): CookieModel | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      const cookieValue = parts.pop()?.split(';').shift();
      if (cookieValue) {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        return new CookieModel(name, cookieValue, futureDate.toUTCString());
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

  validateCookie(name: string): boolean {
    const cookie = this.getCookie(name);

    if (!cookie) {
      return false;
    }

    return cookie.validateCookie();
  }

  deleteCookie(name: string) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  }

}
