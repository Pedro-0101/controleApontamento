import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardSolicitacoes } from './card-solicitacoes';

describe('CardSolicitacoes', () => {
  let component: CardSolicitacoes;
  let fixture: ComponentFixture<CardSolicitacoes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardSolicitacoes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CardSolicitacoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
