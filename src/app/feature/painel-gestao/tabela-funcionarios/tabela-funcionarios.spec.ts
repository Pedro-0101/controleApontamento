import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TabelaFuncionarios } from './tabela-funcionarios';

describe('TabelaFuncionarios', () => {
  let component: TabelaFuncionarios;
  let fixture: ComponentFixture<TabelaFuncionarios>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabelaFuncionarios]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TabelaFuncionarios);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
