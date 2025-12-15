import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { CookiesService } from '../cookies/cookies.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private cookiesService = inject(CookiesService);

  private userCodes: string[] = environment.dnpAccessCode.split(',');
  private userNames: string[] = environment.dnpUserNames.split(',');
  private userName = signal('');
  readonly _userName = computed(() => this.userName());

  constructor() {
    this.logger.info("[AuthService] - AuthService inicializado");
  }

  verificarLogin() {
    this.logger.info("[AuthService] - Tentando verificar sessão");
    const cookie = this.cookiesService.getCookie('userName');

    if (!cookie || !cookie.validateCookie()) {
      this.logger.info("[AuthService] - Sessão não encontrada ou expirada");
      return false;
    }

    this.userName.set(cookie.value);
    this.logger.info("[AuthService] - Sessão restaurada: " + cookie.value);
    return true;
  }

  login(accessCode: string): boolean {
    this.logger.info("[AuthService] - Tentando iniciar sessão");

    if (this.userCodes.filter(u => u === accessCode).length > 0) {
      this.logger.info("[AuthService] - Codigo de acesso válido");
      this.userName.set(this.userNames[this.userCodes.indexOf(accessCode)]);
      this.cookiesService.setCookie('userName', this.userName(), 1);
      return true;
    }
    this.logger.info("[AuthService] - Codigo de acesso inválido");
    return false;
  }

  logout() {
    this.logger.info("[AuthService] - Tentando encerrar sessão");
    this.userName.set('');
    this.cookiesService.deleteCookie('userName');
    return true;
  }

}
