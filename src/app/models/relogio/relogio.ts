export interface IRelogio {
  type: string;
  id: number;
  dataCriacao: string;
  descricao: string;
  numSerie: string;
  status: number;
}

export class Relogio implements IRelogio {

  type: string = '';
  id: number = 0;
  dataCriacao: string = '';
  descricao: string = '';
  numSerie: string = '';
  status: number = 0;

  constructor(data: Partial<IRelogio>) {
    Object.assign(this, data);
  }

  /**
   * Mapper: Converte o JSON bruto da API (PascalCase) para o Model (camelCase)
   */
  static fromJson(json: any): Relogio {
    return new Relogio({
      type: json.__type,
      id: json.id,
      dataCriacao: json.DataCriacao,
      descricao: json.Descricao || '',
      numSerie: json.NumSerieRelogio,
      status: json.Status
    });
  }
}