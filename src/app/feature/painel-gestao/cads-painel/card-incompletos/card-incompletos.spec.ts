import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardIncompletos } from './card-incompletos';

describe('CardIncompletos', () => {
  let component: CardIncompletos;
  let fixture: ComponentFixture<CardIncompletos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardIncompletos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CardIncompletos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
