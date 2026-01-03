import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FiltrosTabela } from './filtros-tabela';

describe('FiltrosTabela', () => {
  let component: FiltrosTabela;
  let fixture: ComponentFixture<FiltrosTabela>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltrosTabela]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FiltrosTabela);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
