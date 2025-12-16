import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectUnit } from './select-unit';

describe('SelectUnit', () => {
  let component: SelectUnit;
  let fixture: ComponentFixture<SelectUnit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectUnit]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectUnit);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
