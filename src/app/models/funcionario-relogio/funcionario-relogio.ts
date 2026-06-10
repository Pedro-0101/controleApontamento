import { Employee } from '../employee/employee';

export interface IFuncionarioRelogio {
  matricula: string;
  nome: string;
  empresa: string;
  local: string;
  cargo: string;
  ativo: number;
  relogiosCadastrado: number | null;
  relogiosAtivo: number | null;
  fonte: 'local' | 'api' | 'ambos';
}

export class FuncionarioRelogio implements IFuncionarioRelogio {
  matricula = '';
  nome = '';
  empresa = '';
  local = '';
  cargo = '';
  ativo = 1;
  relogiosCadastrado: number | null = null;
  relogiosAtivo: number | null = null;
  fonte: 'local' | 'api' | 'ambos' = 'local';

  static fromEmployee(emp: Employee): FuncionarioRelogio {
    const f = new FuncionarioRelogio();
    f.matricula = emp.matricula;
    f.nome = emp.nome;
    f.empresa = emp.empresa ?? '';
    f.local = emp.local ?? '';
    f.cargo = emp.cargo ?? '';
    f.ativo = emp.ativo;
    f.fonte = 'local';
    return f;
  }

  static fromApiJson(json: any): FuncionarioRelogio {
    const f = new FuncionarioRelogio();
    f.matricula = String(json.Matricula ?? '');
    f.nome = '';
    f.empresa = '';
    f.local = '';
    f.cargo = '';
    f.ativo = json.StatusFuncionario === 1 ? 1 : 0;
    f.fonte = 'api';
    return f;
  }
}
