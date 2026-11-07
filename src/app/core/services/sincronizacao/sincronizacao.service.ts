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
}
