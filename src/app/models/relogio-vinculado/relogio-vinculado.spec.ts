import { RelogioVinculado } from './relogio-vinculado';

describe('RelogioVinculado', () => {
  it('should create an instance with defaults', () => {
    const r = new RelogioVinculado();
    expect(r.numSerie).toBe('');
    expect(r.descricao).toBe('');
    expect(r.status).toBe(0);
    expect(r.ativo).toBe(false);
  });

  describe('fromApiJson', () => {
    it('should map NumSerieRelogio and Status from API response', () => {
      const r = RelogioVinculado.fromApiJson({
        DataCriacao: null, Descricao: null, Id: 0,
        NumSerieRelogio: '19140561941', Status: 2
      });
      expect(r.numSerie).toBe('19140561941');
      expect(r.status).toBe(2);
      expect(r.descricao).toBe('');
      expect(r.ativo).toBe(false);
    });

    it('should normalize numSerie removing dots and leading zeros', () => {
      const r = RelogioVinculado.fromApiJson({ NumSerieRelogio: '00.191.405.619', Status: 1 });
      expect(r.numSerie).toBe('191405619');
    });

    it('should mark status 1 as ativo', () => {
      const r = RelogioVinculado.fromApiJson({ NumSerieRelogio: '338101079864', Status: 1 });
      expect(r.ativo).toBe(true);
    });

    it('should handle missing fields gracefully', () => {
      const r = RelogioVinculado.fromApiJson({});
      expect(r.numSerie).toBe('');
      expect(r.status).toBe(0);
    });
  });
});
