import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiSessionService, CompanyToken } from '../apiSession/api-session.service';
import { LoggerService } from '../logger/logger.service';

export class PontoApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PontoApiError';
  }
}

/**
 * Cliente único para as operações da API Ponto Certificado.
 *
 * Centraliza a detecção de token expirado/inválido: se a API responder uma
 * mensagem de erro de token, renova a sessão da empresa e repete a operação
 * uma única vez.
 */
@Injectable({ providedIn: 'root' })
export class PontoApiService {
  private http = inject(HttpClient);
  private session = inject(ApiSessionService);
  private logger = inject(LoggerService);

  async post<T = any>(operation: string, body: object): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; ; attempt++) {
      try {
        return await firstValueFrom(
          this.http.post<T>(`/api/${operation}`, body)
        );
      } catch (error: any) {
        const status = Number(error?.status) || 0;
        const transiente = status === 0 || status === 408 || status === 429 || status >= 500;

        if (!transiente || attempt >= maxAttempts) {
          throw error;
        }

        this.logger.warn(
          'PontoApiService',
          `Falha transitória em ${operation} (HTTP ${status}). Tentativa ${attempt + 1}/${maxAttempts}...`
        );
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Executa uma operação usando o token de uma empresa específica.
   * Em caso de token expirado/inválido, renova e repete uma vez.
   */
  async postForCompany<T = any>(
    operation: string,
    body: object,
    company: CompanyToken
  ): Promise<T> {
    if (!company.token) {
      throw new PontoApiError(`Empresa ${company.nome} está sem token de acesso`);
    }

    let response = await this.post<any>(operation, {
      ...body,
      tokenAcesso: company.token,
    });

    if (!this.session.isTokenErrorMessage(response?.d)) {
      return response as T;
    }

    this.logger.warn(
      'PontoApiService',
      `Token da empresa ${company.nome} inválido/expirado em ${operation}. Renovando...`
    );

    const refreshed = await this.session.refresh();
    const freshToken = this.session.getCompanyById(company.id)?.token;

    if (!refreshed || !freshToken) {
      throw new PontoApiError(
        `Não foi possível renovar o token da empresa ${company.nome}`
      );
    }

    response = await this.post<any>(operation, {
      ...body,
      tokenAcesso: freshToken,
    });

    if (this.session.isTokenErrorMessage(response?.d)) {
      throw new PontoApiError(
        `A API recusou o token da empresa ${company.nome}: ${response.d}`
      );
    }

    return response as T;
  }

  /**
   * Executa a mesma operação para todas as empresas com token válido.
   * Empresas com falha são registradas e não interrompem as demais.
   */
  async postAllCompanies<T = any>(
    operation: string,
    buildBody: (company: CompanyToken) => Record<string, unknown>
  ): Promise<Array<{ company: CompanyToken; response: T }>> {
    const companies = this.session.getCompanies().filter(c => !!c.token);

    const settled = await Promise.allSettled(
      companies.map(async company => {
        const response = await this.postForCompany<T>(
          operation,
          buildBody(company),
          company
        );
        return { company, response };
      })
    );

    const results: Array<{ company: CompanyToken; response: T }> = [];
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        if (item.value.response !== undefined && item.value.response !== null) {
          results.push(item.value as { company: CompanyToken; response: T });
        }
      } else {
        this.logger.error('PontoApiService', `Falha em ${operation}:`, item.reason);
      }
    }

    return results;
  }

  /** Extrai o array de resultados do envelope `{ d: [...] }`. */
  extractArray<T = any>(response: any): T[] {
    const data = response?.d;
    return Array.isArray(data) ? data : [];
  }
}
