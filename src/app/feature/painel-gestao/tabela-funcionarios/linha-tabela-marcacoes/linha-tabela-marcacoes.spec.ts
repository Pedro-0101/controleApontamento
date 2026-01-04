import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinhaTabelaMarcacoes } from './linha-tabela-marcacoes';

describe('LinhaTabelaMarcacoes', () => {
  let component: LinhaTabelaMarcacoes;
  let fixture: ComponentFixture<LinhaTabelaMarcacoes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinhaTabelaMarcacoes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinhaTabelaMarcacoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
