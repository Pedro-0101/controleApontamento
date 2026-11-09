import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface WebhookAssinatura {
  id: number;
  empresa_config_id: number;
  empresa_config_nome: string;
  webhook_id: number | null;
  publisher: string | null;
  secret: string;
  secret_mascarado: string;
  webhook_type: string;
  webhook_uri: string;
  ativo: number;
  ultimo_evento_em: string | null;
  total_eventos: number;
  criado_em: string;
  atualizado_em: string;
  callback_url: string;
  aviso?: string | null;
}

export interface WebhookEvento {
  id: number;
  assinatura_id: number | null;
  empresa_config_id: number | null;
  empresa_config_nome: string | null;
  secret: string;
  tipo_evento: string | null;
  payload: string | null;
  payload_preview: string;
  origem_ip: string | null;
  recebido_em: string;
  processado: number;
  erro: string | null;
}

export interface WebhookSyncEmpresa {
  empresa_config_id: number;
  nome: string;
  assinaturas: number;
  erro: string | null;
}

export interface WebhookSyncResultado {
  success: boolean;
  total: number;
  erros: number;
  empresas: WebhookSyncEmpresa[];
}

export interface CriarWebhookOptions {
  empresaConfigId: number;
  webhookType: string;
  webhookUri?: string;
  usuario?: string;
}

@Injectable({ providedIn: 'root' })
export class WebhookService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/webhooks`;

  async listar(empresaConfigIds?: number[]): Promise<WebhookAssinatura[]> {
    const query = empresaConfigIds?.length ? `?empresaConfigIds=${empresaConfigIds.join(',')}` : '';
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; assinaturas: WebhookAssinatura[] }>(`${this.apiUrl}${query}`)
    );
    return r.success ? r.assinaturas : [];
  }

  async sincronizar(empresaConfigIds?: number[]): Promise<WebhookSyncResultado> {
    return firstValueFrom(
      this.http.post<WebhookSyncResultado>(`${this.apiUrl}/sincronizar`, { empresaConfigIds })
    );
  }

  async criar(options: CriarWebhookOptions): Promise<WebhookAssinatura> {
    const r = await firstValueFrom(
      this.http.post<{ success: boolean; assinatura: WebhookAssinatura }>(
        this.apiUrl,
        options
      )
    );
    return r.assinatura;
  }

  async atualizarUri(id: number, webhookUri: string): Promise<WebhookAssinatura> {
    const r = await firstValueFrom(
      this.http.put<{ success: boolean; assinatura: WebhookAssinatura }>(
        `${this.apiUrl}/${id}`,
        { webhookUri }
      )
    );
    return r.assinatura;
  }

  async desativar(id: number): Promise<WebhookAssinatura> {
    const r = await firstValueFrom(
      this.http.delete<{ success: boolean; assinatura: WebhookAssinatura }>(
        `${this.apiUrl}/${id}`
      )
    );
    return r.assinatura;
  }

  async eventos(limit = 30, empresaConfigIds?: number[]): Promise<WebhookEvento[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (empresaConfigIds?.length) {
      params.set('empresaConfigIds', empresaConfigIds.join(','));
    }
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; eventos: WebhookEvento[] }>(
        `${this.apiUrl}/eventos?${params.toString()}`
      )
    );
    return r.success ? r.eventos : [];
  }
}
