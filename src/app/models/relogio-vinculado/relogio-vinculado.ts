// StatusRelogionEnum da API: -1=Excluso, 0=AAtivar, 1=Ativo, 2=Inativo, 3=NaoAtivado
export const STATUS_RELOGIO_ATIVO = 1;

export interface IRelogioVinculado {
  numSerie: string;
  descricao: string;
  status: number;
}

export class RelogioVinculado implements IRelogioVinculado {
  numSerie = '';
  descricao = '';
  status = 0;

  constructor(data?: Partial<IRelogioVinculado>) {
    Object.assign(this, data ?? {});
  }

  get ativo(): boolean {
    return this.status === STATUS_RELOGIO_ATIVO;
  }

  /**
   * Mapper: Converte o JSON bruto de RetornaRelogiosPorMatricula (PascalCase).
   * A API só preenche NumSerieRelogio e Status nessa operação;
   * Descricao vem nula e é enriquecida depois via RelogioService.
   */
  static fromApiJson(json: any): RelogioVinculado {
    return new RelogioVinculado({
      numSerie: String(json.NumSerieRelogio ?? '').replace(/\./g, '').replace(/^0+/, ''),
      descricao: json.Descricao || '',
      status: json.Status ?? 0
    });
  }
}
