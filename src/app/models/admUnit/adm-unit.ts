export class AdmUnit {
  hierarquia!: string;
  descricao!: string;
  descricaoEmpresa!: string;
  cpfCnpj!: string;
  usuarioEmail!: string;
  id!: number;

  static fromJson(json: any): AdmUnit {

    /**
     * Os nomes estão em portugues e com a primeira letra em maiusculo porque
     * as propriedades do json recebido estão em portugues e com a primeira letra em maiusculo.
     */

    const admUnit = new AdmUnit();
    admUnit.hierarquia = json.Hierarquia;
    admUnit.descricao = json.Descricao;
    admUnit.descricaoEmpresa = json.DescricaoEmpresa;
    admUnit.cpfCnpj = json.CpfCnpj;
    admUnit.usuarioEmail = json.UsuarioEmail;
    admUnit.id = json.Id;
    return admUnit;
  }
}
