import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface RelatorioConsolidadoOpcoes {
  empresas: Array<{ id: number; nome: string }>;
  empresasConfig: Array<{ id: number; nome: string; ativo: number }>;
  relogios: Array<{ num_serie: string; descricao: string; ativo: number; status: number }>;
  locais: string[];
  provedores: string[];
  empresasSistema: number[];
}

export interface RelatorioConsolidadoFiltros {
  dataInicio: string;
  dataFim: string;
  empresaIds?: number[];
  empresaConfigIds?: number[];
  matriculas?: string[];
  numSeries?: string[];
  locais?: string[];
  provedores?: string[];
  empresasSistema?: number[];
  busca?: string;
  tipoRegistro?: number | null;
}

export interface RelatorioConsolidadoTotal {
  registros: number;
  funcionarios: number;
  empresas: number;
  relogios: number;
  dias: number;
}

export interface RelatorioConsolidadoEmpresa {
  empresa_id: number | null;
  empresa_nome: string;
  empresa_config_id: number;
  empresa_config_nome: string;
  registros: number;
  funcionarios: number;
  relogios: number;
  dias: number;
  provedores: string[];
  empresasSistema: number[];
}

export interface RelatorioConsolidadoRegistro {
  id: number;
  empresa_config_id: number;
  empresa_config_nome: string;
  empresa_id: number | null;
  empresa_nome: string;
  marcacao_id: number | null;
  provedor: string;
  provedor_label: string;
  empresasistema: number | null;
  reppid: number | null;
  coletor: number | null;
  turma: string | null;
  status_exportacao: string | null;
  data_hora_coleta: string | null;
  nsr: number | null;
  data_marcacao: string;
  data_insercao: string | null;
  matricula: string;
  funcionario_nome: string;
  cargo: string;
  cpf: string;
  pis: string;
  num_serie_relogio: string;
  relogio_descricao: string;
  tipo_registro: number | null;
  tipo_registro_label: string;
  local: string;
  codigo_unidade: string;
  gps_latitude: string;
  gps_longitude: string;
  flag_fora_cerca: boolean;
  atividade: string;
}

export interface RelatorioConsolidadoResultado {
  success: boolean;
  periodo: { dataInicio: string; dataFim: string };
  totalGeral: RelatorioConsolidadoTotal;
  porEmpresa: RelatorioConsolidadoEmpresa[];
  registros: RelatorioConsolidadoRegistro[];
  truncado: boolean;
  limite: number;
}

export type RelatorioConsolidadoFormato = 'csv' | 'xls' | 'pdf';

@Injectable({ providedIn: 'root' })
export class RelatorioConsolidadoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrlBackend}/relatorios/consolidado`;

  async opcoes(): Promise<RelatorioConsolidadoOpcoes> {
    const r = await firstValueFrom(
      this.http.get<{ success: boolean } & RelatorioConsolidadoOpcoes>(`${this.apiUrl}/opcoes`)
    );
    return {
      empresas: r.empresas || [],
      empresasConfig: r.empresasConfig || [],
      relogios: r.relogios || [],
      locais: r.locais || [],
      provedores: r.provedores || [],
      empresasSistema: r.empresasSistema || [],
    };
  }

  async consultar(filtros: RelatorioConsolidadoFiltros): Promise<RelatorioConsolidadoResultado> {
    return firstValueFrom(
      this.http.get<RelatorioConsolidadoResultado>(this.apiUrl, {
        params: this.buildParams(filtros),
      })
    );
  }

  async exportar(
    filtros: RelatorioConsolidadoFiltros,
    formato: RelatorioConsolidadoFormato
  ): Promise<void> {
    const params = this.buildParams(filtros).set('formato', formato);
    const blob = await firstValueFrom(
      this.http.get(`${this.apiUrl}/exportar`, { params, responseType: 'blob' })
    );

    const extensao = formato === 'xls' ? 'xls' : formato;
    const nome = `relatorio-consolidado-${filtros.dataInicio}-a-${filtros.dataFim}.${extensao}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
  }

  private buildParams(filtros: RelatorioConsolidadoFiltros): HttpParams {
    let params = new HttpParams()
      .set('dataInicio', filtros.dataInicio || '')
      .set('dataFim', filtros.dataFim || '');

    const listas: Array<[string, string[] | number[] | undefined]> = [
      ['empresaIds', filtros.empresaIds],
      ['empresaConfigIds', filtros.empresaConfigIds],
      ['matriculas', filtros.matriculas],
      ['numSeries', filtros.numSeries],
      ['locais', filtros.locais],
      ['provedores', filtros.provedores],
      ['empresasSistema', filtros.empresasSistema],
    ];
    for (const [chave, valores] of listas) {
      if (valores && valores.length > 0) params = params.set(chave, valores.join(','));
    }

    if (filtros.busca) params = params.set('busca', filtros.busca);
    if (filtros.tipoRegistro !== undefined && filtros.tipoRegistro !== null) {
      params = params.set('tipoRegistro', String(filtros.tipoRegistro));
    }

    return params;
  }
}
