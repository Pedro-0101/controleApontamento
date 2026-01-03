import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadsPainel } from './cads-painel';

describe('CadsPainel', () => {
  let component: CadsPainel;
  let fixture: ComponentFixture<CadsPainel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CadsPainel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CadsPainel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
