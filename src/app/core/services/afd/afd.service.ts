import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type AfdOperacao =
  | 'GeraAFD'
  | 'GeraAFDUnico'
  | 'GeraAFDmodeloREPP'
  | 'GeraAFDmodeloREPA'
  | 'GeraAFDDataRecepcao';

export interface AfdOperacaoInfo {
  chave: AfdOperacao;
  label: string;
  api: string;
  exigeRelogio: boolean;
  descricao: string;
}

export interface AfdGeracao {
  id: number;
  empresa_config_id: number;
  empresa_config_nome: string;
  operacao: AfdOperacao;
  operacao_api: string;
  numero_serie: string | null;
  data_inicial: string | null;
  data_final: string | null;
  nome_arquivo: string | null;
  tamanho_bytes: number;
  status: 'CONCLUIDO' | 'ERRO';
  erro: string | null;
  usuario: string | null;
  criado_em: string;
  sucesso?: boolean;
}

export interface AfdGerarOptions {
  empresaConfigIds?: number[];
  operacao: AfdOperacao;
  dataInicial: string;
  dataFim: string;
  numeroSerie?: string;
  numeroRelogioCabecalho?: string;
  usuario?: string;
}

export interface AfdGerarResultado {
  success: boolean;
  operacao: AfdOperacao;
  operacaoLabel: string;
  empresas: AfdGeracao[];
  total: number;
  sucesso: number;
  erros: number;
}

@Injectable({ providedIn: 'root' })
export class AfdService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/afd`;

  async operacoes(): Promise<AfdOperacaoInfo[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; operacoes: AfdOperacaoInfo[] }>(`${this.apiUrl}/operacoes`)
    );
    return r.success ? r.operacoes : [];
  }

  async geracoes(limit = 30): Promise<AfdGeracao[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; geracoes: AfdGeracao[] }>(
        `${this.apiUrl}/geracoes?limit=${limit}`
      )
    );
    return r.success ? r.geracoes : [];
  }

  async gerar(options: AfdGerarOptions): Promise<AfdGerarResultado> {
    return firstValueFrom(
      this.http.post<AfdGerarResultado>(`${this.apiUrl}/gerar`, options)
    );
  }

  async download(id: number, nomeArquivo: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`${this.apiUrl}/geracoes/${id}/download`, { responseType: 'blob' })
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo || `afd-${id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
