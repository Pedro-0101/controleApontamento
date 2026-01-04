import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalCorrecaoMarcacao } from './modal-correcao-marcacao';

describe('ModalCorrecaoMarcacao', () => {
  let component: ModalCorrecaoMarcacao;
  let fixture: ComponentFixture<ModalCorrecaoMarcacao>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalCorrecaoMarcacao]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalCorrecaoMarcacao);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
