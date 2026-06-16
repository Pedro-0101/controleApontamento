import { TestBed } from '@angular/core/testing';
import { FuncionarioRelogioService } from './funcionario-relogio.service';
import { FuncionarioRelogio } from '../../../models/funcionario-relogio/funcionario-relogio';
import { RelogioVinculado } from '../../../models/relogio-vinculado/relogio-vinculado';

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

  describe('dedupVinculados', () => {
    it('should flatten and remove duplicates by numSerie', () => {
      const a = new RelogioVinculado({ numSerie: '111', status: 1 });
      const b = new RelogioVinculado({ numSerie: '222', status: 2 });
      const aDup = new RelogioVinculado({ numSerie: '111', status: 2 });
      const result = service.dedupVinculados([[a, b], [aDup]]);
      expect(result.length).toBe(2);
      expect(result.map(v => v.numSerie)).toEqual(['111', '222']);
      expect(result[0].status).toBe(1);
    });

    it('should skip entries without numSerie', () => {
      const result = service.dedupVinculados([[new RelogioVinculado({ numSerie: '' })]]);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(service.dedupVinculados([])).toEqual([]);
    });
  });

  describe('carregarContadores', () => {
    it('should fill relogiosCadastrado and relogiosAtivo from vinculos', async () => {
      const f = makeFuncionario('140000117', 'local');
      vi.spyOn(service, 'getRelogiosVinculados').mockResolvedValue([
        new RelogioVinculado({ numSerie: '111', status: 1 }),
        new RelogioVinculado({ numSerie: '222', status: 2 })
      ]);

      await service.carregarContadores([f]);

      expect(f.relogiosCadastrado).toBe(2);
      expect(f.relogiosAtivo).toBe(1);
    });

    it('should skip funcionarios already counted or without matricula', async () => {
      const counted = makeFuncionario('001', 'local');
      counted.relogiosCadastrado = 3;
      const semMatricula = makeFuncionario('', 'local');
      const spy = vi.spyOn(service, 'getRelogiosVinculados');

      await service.carregarContadores([counted, semMatricula]);

      expect(spy).not.toHaveBeenCalled();
      expect(counted.relogiosCadastrado).toBe(3);
    });
  });
});
