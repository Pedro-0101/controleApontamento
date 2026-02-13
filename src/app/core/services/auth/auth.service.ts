import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CookiesService } from '../cookies/cookies.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { CryptoService } from '../crypto/crypto.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private cookiesService = inject(CookiesService);
  private startSessionService = inject(ApiSessionService);
  private cryptoService = inject(CryptoService);
  private http = inject(HttpClient);

  private userName = signal('');
  private userCode = signal('');
  private logedAt = signal('');
  private authenticated = signal(false);

  readonly _userName = computed(() => this.userName());
  readonly _userCode = computed(() => this.userCode());
  readonly _logedAt = computed(() => this.logedAt());
  readonly _authenticated = computed(() => this.authenticated());

  constructor() {
    this.logger.info("AuthService", "Componente inicializado");
  }

  async login(accessCode?: string): Promise<boolean> {
    this.logger.info("AuthService", "Realizando tentativa de login");

    if (!accessCode) {
      return this.verifyCookieLogin();
    }

    if (this.authenticated()) {
      this.logger.info("AuthService", "Usuário já logado");
      await this.startSessionService.startSession();
      return true;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrlBackend}/auth/login`, { accessCode })
      );

      if (response && response.success) {
        return this.successLogin(response.user.accessCode, response.user.userName);
      }
    } catch (error) {
      this.logger.error("AuthService", "Erro ao realizar login via API", error);
    }

    this.userName.set('');
    this.userCode.set('');
    this.authenticated.set(false);
    this.logedAt.set('');
    return false;
  }

  private async successLogin(accessCode: string, username: string): Promise<boolean> {

    this.logger.info("AuthService", "Login bem sucedido");

    try {
      await this.startSessionService.startSession();
    } catch (error) {
      this.logger.error("AuthService", "Erro ao iniciar sessão", error);
      return false;
    }

    let date = new Date().toISOString();

    let cryptedCode = this.cryptoService.encryptPayload({ accessCode: accessCode });
    let cryptedName = this.cryptoService.encryptPayload({ userName: username });
    let cryptedDate = this.cryptoService.encryptPayload({ logedAt: date });

    this.userName.set(username);
    this.userCode.set(accessCode);
    this.logedAt.set(date);
    this.authenticated.set(true);

    this.cookiesService.setCookie('userName', cryptedName, 1);
    this.cookiesService.setCookie('accessCode', cryptedCode, 1);
    this.cookiesService.setCookie('logedAt', cryptedDate, 1);

    this.logger.info("AuthService", `Sessão iniciada com sucesso para o usuário ${username}`);

    return true;
  }

  private async verifyCookieLogin(): Promise<boolean> {
    this.logger.info("AuthService", "Verificando cookies para login automático");

    let cryptedName = this.cookiesService.getCookie('userName');
    let cryptedCode = this.cookiesService.getCookie('accessCode');
    let cryptedDate = this.cookiesService.getCookie('logedAt');

    if (!cryptedName || !cryptedCode || !cryptedDate) {
      this.logger.info("AuthService", "Cookies de sessão não encontrados");
      return false;
    }

    let decryptedNamePayload = this.cryptoService.decryptPayload(cryptedName) as { userName: string };
    let decryptedCodePayload = this.cryptoService.decryptPayload(cryptedCode) as { accessCode: string };
    let decryptedDatePayload = this.cryptoService.decryptPayload(cryptedDate) as { logedAt: string };

    if (!decryptedNamePayload || !decryptedCodePayload || !decryptedDatePayload) {
      this.logger.info("AuthService", "Falha ao descriptografar cookies de sessão");
      return false;
    }

    // Re-validate against database to ensure user is still active
    try {
      const accessCode = decryptedCodePayload.accessCode;
      const response = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrlBackend}/auth/login`, { accessCode })
      );

      if (response && response.success) {
        return this.successLogin(response.user.accessCode, response.user.userName);
      }
    } catch (error) {
      this.logger.error("AuthService", "Erro ao validar cookies contra banco de dados", error);
    }

    return false;
  }

  logout() {
    this.logger.info("AuthService", "Encerrando sessão");

    this.userName.set('');
    this.userCode.set('');
    this.authenticated.set(false);
    this.logedAt.set('');

    this.cookiesService.deleteCookie('userName');
    this.cookiesService.deleteCookie('accessCode');
    this.cookiesService.deleteCookie('logedAt');

    return true;
  }

  async getAdminUsers(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; users: string[] }>(`${environment.apiUrlBackend}/auth/users`)
      );
      return response.success ? response.users : [];
    } catch (error) {
      this.logger.error("AuthService", "Erro ao buscar usuários administradores", error);
      return [];
    }
  }
}
