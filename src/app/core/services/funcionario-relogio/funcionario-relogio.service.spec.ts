import { TestBed } from '@angular/core/testing';
import { FuncionarioRelogioService } from './funcionario-relogio.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';

function makeFuncionario(matricula: string, fonte: 'local' | 'api' | 'ambos', nome = ''): FuncionarioRelogio {
  const f = new FuncionarioRelogio();
  f.matricula = matricula;
  f.nome = nome;
  f.fonte = fonte;
  return f;
}

describe('FuncionarioRelogioService', () => {
  let service: FuncionarioRelogioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FuncionarioRelogioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('merge', () => {
    it('should return local-only employees with fonte=local', () => {
      const result = service.merge([makeFuncionario('001', 'local', 'João')], []);
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('local');
      expect(result[0].nome).toBe('João');
    });

    it('should return api-only employees with fonte=api', () => {
      const result = service.merge([], [makeFuncionario('001', 'api')]);
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('api');
    });

    it('should mark employees in both sources as fonte=ambos preserving local data', () => {
      const result = service.merge(
        [makeFuncionario('001', 'local', 'João Local')],
        [makeFuncionario('001', 'api', '')]
      );
      expect(result.length).toBe(1);
      expect(result[0].fonte).toBe('ambos');
      expect(result[0].nome).toBe('João Local');
    });

    it('should combine distinct employees from both sources without duplicates', () => {
      const result = service.merge(
        [makeFuncionario('001', 'local'), makeFuncionario('002', 'local')],
        [makeFuncionario('001', 'api'), makeFuncionario('003', 'api')]
      );
      expect(result.length).toBe(3);
      expect(result.map(f => f.matricula).sort()).toEqual(['001', '002', '003']);
    });

    it('should return empty array when both sources are empty', () => {
      expect(service.merge([], [])).toEqual([]);
    });
  });
});
