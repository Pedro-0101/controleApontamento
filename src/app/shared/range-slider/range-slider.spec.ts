import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RangeSlider, RangeValue } from './range-slider';

describe('RangeSlider', () => {
  let component: RangeSlider;
  let fixture: ComponentFixture<RangeSlider>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RangeSlider]
    }).compileComponents();

    fixture = TestBed.createComponent(RangeSlider);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('min', 0);
    fixture.componentRef.setInput('max', 10);
    fixture.detectChanges();
  });

  function fakeInput(value: number): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'range';
    el.min = '0';
    el.max = '10';
    el.value = String(value);
    return el;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('deve inicializar os valores com os limites informados', () => {
    expect(component.valueMin()).toBe(0);
    expect(component.valueMax()).toBe(10);
  });

  it('deve emitir rangeChange ao alterar o mínimo', () => {
    let emitted: RangeValue | undefined;
    component.rangeChange.subscribe(r => (emitted = r));

    component.onMinInput(fakeInput(3));

    expect(component.valueMin()).toBe(3);
    expect(emitted).toEqual({ min: 3, max: 10 });
  });

  it('não deve permitir que o mínimo ultrapasse o máximo', () => {
    component.onMaxInput(fakeInput(4));
    component.onMinInput(fakeInput(8));

    expect(component.valueMin()).toBe(4);
    expect(component.valueMax()).toBe(4);
  });

  it('não deve permitir que o máximo fique abaixo do mínimo', () => {
    component.onMinInput(fakeInput(6));
    component.onMaxInput(fakeInput(2));

    expect(component.valueMax()).toBe(6);
  });

  it('deve exibir "+" no teto quando openEnded', () => {
    fixture.componentRef.setInput('openEnded', true);
    fixture.detectChanges();

    expect(component.maxLabel()).toBe('10+');

    component.onMaxInput(fakeInput(7));
    expect(component.maxLabel()).toBe('7');
  });
});
