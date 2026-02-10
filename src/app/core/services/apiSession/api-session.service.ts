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

  constructor(private http: HttpClient) {
    this.logger.info("ApiSessionService", "Componente inicializado")
  }

  get token() {
    return this.tokenSession.asReadonly();
  }

  async startSession() {
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

      let token: string | null = response.d;

      if (token && token.trim() !== '') {
        this.tokenSession.set(token);
        this.logger.info("ApiSessionService", "Sessão iniciada com sucesso");
        return;
      }

      this.logger.error("ApiSessionService", "Token vazio ou inválido. Verifique chaveEmpresa, usuário ou senha.");
      return;

    } catch (error: any) {
      this.logger.error("ApiSessionService", "Erro ao iniciar sessão:", error);

      if (error.error) {
        this.logger.error("ApiSessionService", "Detalhes do erro:", error.error);
      }
      return;
    }
  }

  endSession() {
    this.logger.info("ApiSessionService", "Encerrando sessão");
    this.tokenSession.set(null);
  }
}
