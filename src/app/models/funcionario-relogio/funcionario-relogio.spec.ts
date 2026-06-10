import { FuncionarioRelogio } from './funcionario-relogio';
import { Employee } from '../employee/employee';

describe('FuncionarioRelogio', () => {
  it('should create an instance with null counters', () => {
    const f = new FuncionarioRelogio();
    expect(f.relogiosCadastrado).toBeNull();
    expect(f.relogiosAtivo).toBeNull();
  });

  describe('fromEmployee', () => {
    it('should map all employee fields and set fonte=local', () => {
      const emp = Employee.fromJson({
        id: 1, matricula: '001', nome: 'João Silva', empresa: 'Mix Caieiras',
        local: 'Administração', cargo: 'Operador', ativo: 1, trabalha_sabado: 1
      });
      const f = FuncionarioRelogio.fromEmployee(emp);
      expect(f.matricula).toBe('001');
      expect(f.nome).toBe('João Silva');
      expect(f.empresa).toBe('Mix Caieiras');
      expect(f.local).toBe('Administração');
      expect(f.cargo).toBe('Operador');
      expect(f.ativo).toBe(1);
      expect(f.fonte).toBe('local');
      expect(f.relogiosCadastrado).toBeNull();
      expect(f.relogiosAtivo).toBeNull();
    });
  });

  describe('fromApiJson', () => {
    it('should map Matricula and StatusFuncionario=1 as ativo', () => {
      const f = FuncionarioRelogio.fromApiJson({
        Matricula: '002', StatusFuncionario: 1,
        Categoria: 'COMERCIAL', CodCategoria: 157, StatusCategoria: 1
      });
      expect(f.matricula).toBe('002');
      expect(f.ativo).toBe(1);
      expect(f.nome).toBe('');
      expect(f.empresa).toBe('');
      expect(f.fonte).toBe('api');
      expect(f.relogiosCadastrado).toBeNull();
    });

    it('should map StatusFuncionario != 1 as ativo=0', () => {
      const f = FuncionarioRelogio.fromApiJson({
        Matricula: '003', StatusFuncionario: 3,
        Categoria: 'MOTORISTA', CodCategoria: 148, StatusCategoria: 1
      });
      expect(f.ativo).toBe(0);
    });
  });
});
