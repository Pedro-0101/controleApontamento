import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardFaltas } from './card-faltas';

describe('CardFaltas', () => {
  let component: CardFaltas;
  let fixture: ComponentFixture<CardFaltas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardFaltas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CardFaltas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
