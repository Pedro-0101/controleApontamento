import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../logger/logger.service';

@Injectable({
  providedIn: 'root',
})
export class ApiSessionService {

  private logger = inject(LoggerService);

  tokenSession = signal<string | null>(null);
  private chaveEmpresa = environment.chaveEmpresa;
  private usuarioEmpresa = environment.usuarioEmpresa;
  private senhaEmpresa = environment.senhaEmpresa;

  private refreshTimer: any;
  private retryCount = 0;

  constructor(private http: HttpClient) {
    this.logger.info("ApiSessionService", "Componente inicializado")
  }

  get token() {
    return this.tokenSession.asReadonly();
  }

  async startSession(): Promise<boolean> {
    try {
      this.logger.info("ApiSessionService", "Iniciando sessão");

      const body = {
        chaveEmpresa: this.chaveEmpresa,
        usuario: this.usuarioEmpresa,
        senha: this.senhaEmpresa
      };

      const response = await firstValueFrom(
        this.http.post<any>(environment.apiUrlStartSession, body)
      );

      this.logger.info("ApiSessionService", "Resposta recebida");

      let token: string | null = response?.d;

      if (token && token.trim() !== '') {
        this.tokenSession.set(token);
        this.logger.info("ApiSessionService", "Sessão iniciada com sucesso");
        this.startOrResetBackgroundRefresh();
        return true;
      }

      this.logger.error("ApiSessionService", "Token vazio ou inválido. Verifique chaveEmpresa, usuário ou senha.");
      return false;

    } catch (error: any) {
      this.logger.error("ApiSessionService", "Erro ao iniciar sessão:", error);

      if (error.error) {
        this.logger.error("ApiSessionService", "Detalhes do erro:", error.error);
      }
      return false;
    }
  }

  endSession() {
    this.logger.info("ApiSessionService", "Encerrando sessão");
    this.tokenSession.set(null);
    this.stopBackgroundRefresh();
  }

  private startOrResetBackgroundRefresh() {
    this.stopBackgroundRefresh();
    this.retryCount = 0;
    // Agendar próximo refresh para 20 minutos
    this.refreshTimer = setTimeout(() => {
      this.attemptRefresh();
    }, 20 * 60 * 1000); 
  }

  private stopBackgroundRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async attemptRefresh() {
    this.logger.info("ApiSessionService", "Tentativa de refresh automático do token");
    const success = await this.startSession();
    
    if (!success) {
      // Falhou o refresh normal, iniciar ciclo de retry 
      // (10 vezes em 5 minutos = 1 tentativa a cada 30 segundos)
      this.handleRetry();
    }
  }

  private handleRetry() {
    if (this.retryCount >= 10) {
      this.logger.error("ApiSessionService", "Falha crítica: Não foi possível renovar o token de sessão após 10 tentativas.");
      return; 
    }
    
    this.retryCount++;
    this.logger.info("ApiSessionService", `Retry de refresh de token: tentativa ${this.retryCount}/10 em 30 segundos...`);
    
    this.refreshTimer = setTimeout(async () => {
      const success = await this.startSession();
      if (!success) {
        this.handleRetry();
      }
    }, 30 * 1000); // 30 segundos
  }
}
