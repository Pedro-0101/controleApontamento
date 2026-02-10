export class Employee {
  id!: number;
  matricula!: string;
  empresa!: string;
  nome!: string;
  qrcod!: string;
  ativo!: number; // 0 ou 1

  static fromJson(json: any): Employee {
    const employee = new Employee();
    employee.id = json.id;
    employee.matricula = json.matricula;
    employee.empresa = json.empresa;
    employee.nome = json.nome;
    employee.qrcod = json.qrcod;
    employee.ativo = json.ativo ?? 1; // Default 1 se não informado
    return employee;
  }
}
