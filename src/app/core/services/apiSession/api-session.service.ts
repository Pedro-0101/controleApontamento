import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';

export interface CompanyToken {
  id: number;
  nome: string;
  token: string | null;
  erro: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class ApiSessionService {
  private logger = inject(LoggerService);

  private companyTokens = signal<CompanyToken[]>([]);

  // Retrocompatível — retorna o primeiro token válido
  readonly tokenSession = computed(() =>
    this.companyTokens().find(c => c.token)?.token ?? null
  );

  private refreshTimer: any;
  private retryCount = 0;

  constructor(private http: HttpClient) {
    this.logger.info('ApiSessionService', 'Componente inicializado');
  }

  get token() {
    return this.tokenSession;
  }

  getAllTokens(): string[] {
    return this.companyTokens()
      .map(c => c.token)
      .filter((t): t is string => t !== null && t.trim() !== '');
  }

  getCompanies(): CompanyToken[] {
    return this.companyTokens();
  }

  async startSession(): Promise<boolean> {
    this.logger.info('ApiSessionService', 'Iniciando sessões para todas as empresas');
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; tokens: CompanyToken[] }>(
          `${environment.apiUrlBackend}/empresas-config/tokens`
        )
      );

      if (response?.success && response.tokens?.length > 0) {
        this.companyTokens.set(response.tokens);
        const validos = response.tokens.filter(c => c.token).length;
        this.logger.info('ApiSessionService', `${validos}/${response.tokens.length} tokens obtidos`);

        if (validos > 0) {
          this.startOrResetBackgroundRefresh();
          return true;
        }
      }

      this.logger.error('ApiSessionService', 'Nenhum token válido retornado');
      return false;
    } catch (error: any) {
      this.logger.error('ApiSessionService', 'Erro ao iniciar sessões:', error);
      return false;
    }
  }

  endSession() {
    this.logger.info('ApiSessionService', 'Encerrando sessão');
    this.companyTokens.set([]);
    this.stopBackgroundRefresh();
  }

  private startOrResetBackgroundRefresh() {
    this.stopBackgroundRefresh();
    this.retryCount = 0;
    this.refreshTimer = setTimeout(() => this.attemptRefresh(), 20 * 60 * 1000);
  }

  private stopBackgroundRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async attemptRefresh() {
    this.logger.info('ApiSessionService', 'Refresh automático dos tokens');
    const success = await this.startSession();
    if (!success) this.handleRetry();
  }

  private handleRetry() {
    if (this.retryCount >= 10) {
      this.logger.error('ApiSessionService', 'Falha crítica: não foi possível renovar tokens após 10 tentativas.');
      return;
    }
    this.retryCount++;
    this.logger.info('ApiSessionService', `Retry ${this.retryCount}/10 em 30s...`);
    this.refreshTimer = setTimeout(async () => {
      const success = await this.startSession();
      if (!success) this.handleRetry();
    }, 30 * 1000);
  }
}
