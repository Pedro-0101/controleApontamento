export class Employee {
  id!: number;
  matricula!: string;
  empresa!: string;
  nome!: string;
  local!: string;
  cargo!: string;
  ativo!: number; // 0 ou 1
  trabalha_sabado!: number; // 0 ou 1
  data_admissao?: string;       // YYYY-MM-DD, opcional
  data_fim_experiencia?: string; // YYYY-MM-DD, opcional

  static fromJson(json: any): Employee {
    const employee = new Employee();
    employee.id = json.id;
    employee.matricula = json.matricula;
    employee.empresa = json.empresa;
    employee.nome = json.nome;
    employee.local = json.local ?? '';
    employee.cargo = json.cargo ?? '';
    employee.ativo = json.ativo ?? 1;
    employee.trabalha_sabado = Number(json.trabalha_sabado ?? 1);
    employee.data_admissao = json.data_admissao
      ? String(json.data_admissao).substring(0, 10)
      : undefined;
    employee.data_fim_experiencia = json.data_fim_experiencia
      ? String(json.data_fim_experiencia).substring(0, 10)
      : undefined;
    return employee;
  }
}
