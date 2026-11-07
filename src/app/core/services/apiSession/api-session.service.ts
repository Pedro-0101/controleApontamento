import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
import { ToastService } from '../toast/toast.service';
import { environment } from '../../../../environments/environment';

export interface CompanyToken {
  id: number;
  nome: string;
  token: string | null;
  erro: string | null;
}

// Mensagens que a API externa devolve no campo `d` (HTTP 200) quando o token
// não serve mais. A API não usa um código fixo, então comparamos por palavra-chave.
const TOKEN_ERROR_KEYWORDS = [
  'desativada',
  'desativado',
  'contate o suporte',
  'não encontrada',
  'nao encontrada',
  'inválid',
  'invalid',
  'expirad',
  'token',
  'sessão',
  'sessao',
  'não autorizado',
  'nao autorizado',
  'unauthorized',
];

@Injectable({
  providedIn: 'root',
})
export class ApiSessionService {
  private logger = inject(LoggerService);
  private toastService = inject(ToastService);

  private companyTokens = signal<CompanyToken[]>([]);

  // Retrocompatível — retorna o primeiro token válido
  readonly tokenSession = computed(() =>
    this.companyTokens().find(c => c.token)?.token ?? null
  );

  private refreshTimer: any;
  private retryCount = 0;
  private inFlightLoad: Promise<boolean> | null = null;

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

  getCompanyById(id: number): CompanyToken | undefined {
    return this.companyTokens().find(c => c.id === id);
  }

  /**
   * Identifica se um valor retornado pela API externa é uma mensagem de
   * token inválido/expirado (e não um payload válido).
   */
  isTokenErrorMessage(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.toLowerCase();
    return TOKEN_ERROR_KEYWORDS.some(keyword => normalized.includes(keyword));
  }

  /**
   * Inicia as sessões de todas as empresas.
   * Chamadas concorrentes compartilham a mesma requisição.
   */
  async startSession(): Promise<boolean> {
    return this.loadTokens(false);
  }

  /**
   * Força um novo StartSession no backend, ignorando o cache em memória.
   * Usado quando a API externa sinaliza token expirado.
   */
  async refresh(): Promise<boolean> {
    this.logger.info('ApiSessionService', 'Renovando tokens (force)');
    return this.loadTokens(true);
  }

  private loadTokens(force: boolean): Promise<boolean> {
    if (this.inFlightLoad) {
      return this.inFlightLoad;
    }

    this.inFlightLoad = this.fetchTokens(force).finally(() => {
      this.inFlightLoad = null;
    });

    return this.inFlightLoad;
  }

  private async fetchTokens(force: boolean): Promise<boolean> {
    this.logger.info('ApiSessionService [startSession]', `Iniciando sessões (force=${force})`);
    try {
      const url = `${environment.apiUrlBackend}/empresas-config/tokens${force ? '?force=1' : ''}`;
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; tokens: CompanyToken[] }>(url)
      );

      this.logger.info('ApiSessionService [startSession]', `Resposta: success=${response?.success} tokensCount=${response?.tokens?.length}`);

      if (response?.success && response.tokens?.length > 0) {
        this.companyTokens.set(response.tokens);
        const validos = response.tokens.filter(c => c.token).length;
        this.logger.info('ApiSessionService [startSession]', `${validos}/${response.tokens.length} tokens obtidos`);
        this.logger.info('ApiSessionService [startSession]', `Empresas: ${response.tokens.map(c => `${c.nome}(token=${!!c.token})`).join(', ')}`);

        const desativadas = response.tokens.filter(c => c.erro);
        if (desativadas.length > 0) {
          const nomes = desativadas.map(c => c.nome).join(', ');
          this.toastService.warning(
            `As seguintes empresas estão desativadas na API: ${nomes}`,
            10000
          );
          this.logger.warn('ApiSessionService [startSession]', `Empresas desativadas: ${nomes}`);
        }

        if (validos > 0) {
          this.startOrResetBackgroundRefresh();
          this.logger.info('ApiSessionService [startSession]', 'Sessão iniciada com sucesso');
          return true;
        }
      }

      this.logger.error('ApiSessionService [startSession]', 'Nenhum token válido retornado');
      return false;
    } catch (error: any) {
      this.logger.error('ApiSessionService [startSession]', 'Erro ao iniciar sessões:', error);
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
    const success = await this.refresh();
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
      const success = await this.refresh();
      if (!success) this.handleRetry();
    }, 30 * 1000);
  }
}
