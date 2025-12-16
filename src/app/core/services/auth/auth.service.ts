import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';
import { CookiesService } from '../cookies/cookies.service';
import { ApiSessionService } from '../apiSession/api-session.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private cookiesService = inject(CookiesService);
  private startSessionService = inject(ApiSessionService);

  private userCodes: string[] = environment.dnpAccessCode.split(',');
  private userNames: string[] = environment.dnpUserNames.split(',');

  private userName = signal('');
  private logedIn = signal(false);
  private logedAt = signal(new Date());

  readonly _userName = computed(() => this.userName());
  readonly _logedIn = computed(() => this.logedIn());
  readonly _logedAt = computed(() => this.logedAt());

  constructor() {
    this.logger.info("AuthService", "Componente inicializado");
  }

  async login(accessCode: string): Promise<boolean> {
    this.logger.info("AuthService", "Tentando iniciar sessão");
    const cookie = this.cookiesService.getCookie('userName');

    if (this.logedIn()) {
      this.logger.info("AuthService", "Usuário já logado");
      await this.startSessionService.startSession();
      return true;
    }

    if (!accessCode) {
      this.logger.info("AuthService", "Codigo de acesso inválido");
      this.userName.set('');
      this.logedIn.set(false);
      this.logedAt.set(new Date());
      return false;
    }

    if (cookie) {
      this.logger.info("AuthService", "Usuário já logado");
      this.userName.set(cookie);
      this.logedIn.set(true);
      this.logedAt.set(new Date());
      await this.startSessionService.startSession();
      return true;
    }

    if (this.userCodes.filter(u => u === accessCode).length === 0) {
      this.logger.info("AuthService", "Codigo de acesso inválido");
      this.userName.set('');
      this.logedIn.set(false);
      this.logedAt.set(new Date());
      return false;
    }

    this.logger.info("AuthService", "Codigo de acesso válido");
    this.userName.set(this.userNames[this.userCodes.indexOf(accessCode)]);
    this.logedIn.set(true);
    this.logedAt.set(new Date());
    this.cookiesService.setCookie('userName', this.userName(), 1);
    await this.startSessionService.startSession();
    return true;
  }

  logout() {
    this.logger.info("AuthService", "Encerrando sessão");
    this.userName.set('');
    this.logedIn.set(false);
    this.logedAt.set(new Date());
    this.cookiesService.deleteCookie('userName');
    return true;
  }

}
