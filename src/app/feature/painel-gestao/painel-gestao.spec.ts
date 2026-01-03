import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PainelGestao } from './painel-gestao';

describe('PainelGestao', () => {
  let component: PainelGestao;
  let fixture: ComponentFixture<PainelGestao>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PainelGestao]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PainelGestao);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
