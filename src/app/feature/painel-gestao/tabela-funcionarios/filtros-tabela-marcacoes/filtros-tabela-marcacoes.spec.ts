import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FiltrosTabelaMarcacoes } from './filtros-tabela-marcacoes';

describe('FiltrosTabelaMarcacoes', () => {
  let component: FiltrosTabelaMarcacoes;
  let fixture: ComponentFixture<FiltrosTabelaMarcacoes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltrosTabelaMarcacoes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FiltrosTabelaMarcacoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
