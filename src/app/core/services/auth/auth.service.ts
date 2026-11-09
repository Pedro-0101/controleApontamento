import { computed, inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { CookiesService } from '../cookies/cookies.service';
import { ApiSessionService } from '../apiSession/api-session.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private cookiesService = inject(CookiesService);
  private startSessionService = inject(ApiSessionService);
  private http = inject(HttpClient);

  private userName = signal('');
  private logedAt = signal('');
  private authenticated = signal(false);

  readonly _userName = computed(() => this.userName());
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
      // A sessão com APIs externas é opcional: o painel e os relatórios leem a
      // base local unificada. Uma falha aqui não pode bloquear o login.
      this.startSessionService.startSession().catch(() => undefined);
      return true;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrlBackend}/auth/login`, { accessCode })
      );

      if (response?.success && response.sessionToken) {
        return this.successLogin(response.sessionToken, response.user?.userName || '');
      }
    } catch (error) {
      this.logger.error("AuthService", "Erro ao realizar login via API", error);
    }

    this.clearState();
    return false;
  }

  private async successLogin(sessionToken: string, username: string): Promise<boolean> {
    this.logger.info("AuthService", "Login bem sucedido");

    // Sessões de API são opcionais para o painel/relatórios locais. Inicia em
    // segundo plano para não atrasar nem bloquear o login.
    this.startSessionService.startSession().catch(() => {
      this.logger.warn("AuthService", "Não foi possível iniciar a sessão com as APIs externas; seguindo com a base local.");
    });

    this.applySession(sessionToken, username);
    this.logger.info("AuthService", `Sessão iniciada para o usuário ${username}`);
    return true;
  }

  /**
   * Guarda no navegador apenas o token de sessão opaco emitido pelo backend.
   * O código de acesso (credencial) nunca é persistido no cliente.
   */
  private applySession(sessionToken: string, username: string): void {
    const date = new Date().toISOString();

    this.userName.set(username);
    this.logedAt.set(date);
    this.authenticated.set(true);

    this.cookiesService.setCookie('sessionToken', sessionToken, 1);
    this.cookiesService.setCookie('userName', username, 1);
    this.cookiesService.setCookie('logedAt', date, 1);

    // Remove cookie legado que guardava o código de acesso.
    this.cookiesService.deleteCookie('accessCode');
  }

  private clearState(): void {
    this.userName.set('');
    this.authenticated.set(false);
    this.logedAt.set('');
  }

  private async verifyCookieLogin(): Promise<boolean> {
    this.logger.info("AuthService", "Verificando cookies para login automático");

    const sessionToken = this.cookiesService.getCookie('sessionToken');
    const username = this.cookiesService.getCookie('userName');
    const logedAt = this.cookiesService.getCookie('logedAt');

    if (!sessionToken || !username || !logedAt) {
      this.logger.info("AuthService", "Cookies de sessão não encontrados");
      return false;
    }

    // Revalida o token de sessão no backend (não reenvia a credencial).
    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrlBackend}/auth/session`, { sessionToken })
      );

      if (response?.success) {
        return this.successLogin(sessionToken, response.user?.userName || username);
      }
    } catch (error) {
      this.logger.error("AuthService", "Erro ao validar sessão", error);
    }

    this.clearState();
    this.cookiesService.deleteCookie('sessionToken');
    this.cookiesService.deleteCookie('userName');
    this.cookiesService.deleteCookie('logedAt');
    return false;
  }

  async logout() {
    this.logger.info("AuthService", "Encerrando sessão");

    const sessionToken = this.cookiesService.getCookie('sessionToken');
    if (sessionToken) {
      try {
        await firstValueFrom(
          this.http.post(`${environment.apiUrlBackend}/auth/logout`, { sessionToken })
        );
      } catch (error) {
        this.logger.warn("AuthService", "Falha ao encerrar sessão no servidor", error);
      }
    }

    this.clearState();

    this.cookiesService.deleteCookie('sessionToken');
    this.cookiesService.deleteCookie('userName');
    this.cookiesService.deleteCookie('logedAt');
    this.cookiesService.deleteCookie('accessCode');

    this.startSessionService.endSession();

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
