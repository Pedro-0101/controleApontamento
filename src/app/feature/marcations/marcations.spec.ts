import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Marcations } from './marcations';

describe('Marcations', () => {
  let component: Marcations;
  let fixture: ComponentFixture<Marcations>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Marcations]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Marcations);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
