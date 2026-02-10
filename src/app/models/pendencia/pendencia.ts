export class Pendencia {
  matricula!: string;
  nome!: string;

  static fromJson(json: any): Pendencia {
    const pendencia = new Pendencia();
    pendencia.matricula = json.matricula;
    pendencia.nome = json.nome || 'nome nao encontrado';
    return pendencia;
  }
}
