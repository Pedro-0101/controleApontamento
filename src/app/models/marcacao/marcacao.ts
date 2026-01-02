export interface IMarcacaoJson {
  id: number;
  Atividade: string;
  CPF: string;
  CodigoUnidade: string;
  DataInsercao: string;
  DataMarcacao: string;
  DescricaoLocal: string | null;
  FlagForaCerca: boolean;
  Formulario: any;
  GPSLatitude: string;
  GPSLongitude: string;
  IdLocal: number;
  LstRespostas: any[];
  MatriculaFuncionario: string;
  NSR: number;
  NomeLocal: string | null;
  NumSerieRelogio: string;
  PIS: string;
  TipoRegistro: number;
  TrabalhadorId: number;
}

export class Marcacao {
  id!: number;
  atividade!: string;
  cpf!: string;
  codigoUnidade!: string;
  dataInsercao!: Date;
  dataMarcacao!: Date;
  descricaoLocal!: string | null;
  flagForaCerca!: boolean;
  formulario!: any;
  gpsLatitude!: number;
  gpsLongitude!: number;
  idLocal!: number;
  lstRespostas!: any[];
  matriculaFuncionario!: string;
  nsr!: number;
  nomeLocal!: string | null;
  numSerieRelogio!: string;
  pis!: string;
  tipoRegistro!: number;
  trabalhadorId!: number;

  constructor(data: Partial<Marcacao>) {
    Object.assign(this, data);
  }

  /**
   * Converte o JSON bruto do servidor para uma instância da classe Marcacao
   */
  static fromJson(json: IMarcacaoJson): Marcacao {
    return new Marcacao({
      id: json.id,
      atividade: json.Atividade,
      cpf: json.CPF,
      codigoUnidade: json.CodigoUnidade,
      dataInsercao: this.parseJsonDate(json.DataInsercao),
      dataMarcacao: this.parseJsonDate(json.DataMarcacao),
      descricaoLocal: json.DescricaoLocal,
      flagForaCerca: json.FlagForaCerca,
      formulario: json.Formulario,
      gpsLatitude: parseFloat(json.GPSLatitude),
      gpsLongitude: parseFloat(json.GPSLongitude),
      idLocal: json.IdLocal,
      lstRespostas: json.LstRespostas,
      matriculaFuncionario: json.MatriculaFuncionario,
      nsr: json.NSR,
      nomeLocal: json.NomeLocal,
      numSerieRelogio: json.NumSerieRelogio,
      pis: json.PIS,
      tipoRegistro: json.TipoRegistro,
      trabalhadorId: json.TrabalhadorId
    });
  }

  /**
   * Helper para converter o formato Microsoft JSON Date "/Date(123456789-0300)/"
   */
  private static parseJsonDate(dateStr: string): Date {
    const timestamp = dateStr.match(/\d+/);
    return timestamp ? new Date(parseInt(timestamp[0], 10)) : new Date();
  }
}