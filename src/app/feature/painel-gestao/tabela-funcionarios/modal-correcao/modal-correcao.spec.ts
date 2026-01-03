import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalCorrecao } from './modal-correcao';

describe('ModalCorrecao', () => {
  let component: ModalCorrecao;
  let fixture: ComponentFixture<ModalCorrecao>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalCorrecao]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalCorrecao);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
