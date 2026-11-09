import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SincronizacaoStats {
  inseridos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  statusDivergentes: number;
  semEmpresa: number;
}

export interface SincronizacaoEmpresa {
  empresa_config_id: number;
  nome: string;
  empresa_padrao: string | null;
  funcionarios: SincronizacaoStats | null;
  relogios: SincronizacaoStats | null;
  erro: string | null;
}

export interface SincronizacaoResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  duracaoMs: number;
  empresas: SincronizacaoEmpresa[];
}

export interface SincronizacaoHistorico {
  id: number;
  tipo: string;
  status: string;
  usuario: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  empresas_processadas: number;
  resumo: {
    recursos?: string[];
    incluirNovos?: boolean;
    atualizarStatus?: boolean;
    empresas?: SincronizacaoEmpresa[];
  } | null;
  erro: string | null;
}

export interface ExecutarSincronizacaoOptions {
  empresaConfigIds?: number[];
  recursos?: Array<'funcionarios' | 'relogios'>;
  incluirNovos?: boolean;
  atualizarStatus?: boolean;
  usuario?: string;
}

export interface MarcacoesSyncStats {
  inseridos: number;
  atualizados: number;
  inalterados: number;
  ignorados: number;
  total: number;
  ultimoId: number;
}

export interface MarcacoesSyncEmpresa {
  empresa_config_id: number;
  nome: string;
  empresa_padrao: string | null;
  modo: 'periodo' | 'incremental';
  dataInicio: string | null;
  dataFim: string | null;
  periodos: number | null;
  marcacoes: MarcacoesSyncStats | null;
  ultimo_id: number | null;
  ultimo_id_anterior: number | null;
  erro: string | null;
}

export interface MarcacoesSyncResultado {
  success: boolean;
  execucaoId: number;
  status: 'CONCLUIDO' | 'PARCIAL' | 'ERRO';
  modo: 'periodo' | 'incremental';
  duracaoMs: number;
  empresas: MarcacoesSyncEmpresa[];
}

export interface MarcacoesSyncStatus {
  empresa_config_id: number;
  nome: string;
  ativo: number;
  ultimo_id: number;
  ultima_sincronizacao_em: string | null;
  ultima_sincronizacao_tipo: string | null;
  ultimo_total_importado: number;
}

export interface ExecutarMarcacoesOptions {
  empresaConfigIds?: number[];
  modo: 'periodo' | 'incremental';
  dataInicio?: string;
  dataFim?: string;
  matriculaFuncionario?: string;
  numSerieRelogio?: string;
  usuario?: string;
}

@Injectable({ providedIn: 'root' })
export class SincronizacaoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/sincronizacao`;

  async executar(options: ExecutarSincronizacaoOptions = {}): Promise<SincronizacaoResultado> {
    return firstValueFrom(
      this.http.post<SincronizacaoResultado>(`${this.apiUrl}/executar`, options)
    );
  }

  async historico(limit = 20): Promise<SincronizacaoHistorico[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; historico: SincronizacaoHistorico[] }>(
        `${this.apiUrl}/historico?limit=${limit}`
      )
    );
    return r.success ? r.historico : [];
  }

  async executarMarcacoes(options: ExecutarMarcacoesOptions): Promise<MarcacoesSyncResultado> {
    return firstValueFrom(
      this.http.post<MarcacoesSyncResultado>(`${this.apiUrl}/marcacoes`, options)
    );
  }

  async statusMarcacoes(): Promise<MarcacoesSyncStatus[]> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean; status: MarcacoesSyncStatus[] }>(
        `${this.apiUrl}/marcacoes/status`
      )
    );
    return r.success ? r.status : [];
  }
}
