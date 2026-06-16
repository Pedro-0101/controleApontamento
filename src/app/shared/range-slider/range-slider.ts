import { Component, EventEmitter, OnInit, Output, computed, input, signal } from '@angular/core';

export interface RangeValue {
  min: number;
  max: number;
}

@Component({
  selector: 'app-range-slider',
  standalone: true,
  templateUrl: './range-slider.html',
  styleUrl: './range-slider.css'
})
export class RangeSlider implements OnInit {
  label = input<string>('');
  min = input<number>(0);
  max = input<number>(100);
  /** Exibe "+" quando o valor máximo está no limite superior (ex.: "10+" = sem teto) */
  openEnded = input<boolean>(false);

  @Output() rangeChange = new EventEmitter<RangeValue>();

  valueMin = signal(0);
  valueMax = signal(100);

  pctMin = computed(() => this.toPct(this.valueMin()));
  pctMax = computed(() => this.toPct(this.valueMax()));

  maxLabel = computed(() => {
    const sufixo = this.openEnded() && this.valueMax() === this.max() ? '+' : '';
    return `${this.valueMax()}${sufixo}`;
  });

  ngOnInit() {
    this.valueMin.set(this.min());
    this.valueMax.set(this.max());
  }

  onMinInput(input: HTMLInputElement) {
    const value = Math.min(Number(input.value), this.valueMax());
    input.value = String(value);
    if (value === this.valueMin()) return;
    this.valueMin.set(value);
    this.emit();
  }

  onMaxInput(input: HTMLInputElement) {
    const value = Math.max(Number(input.value), this.valueMin());
    input.value = String(value);
    if (value === this.valueMax()) return;
    this.valueMax.set(value);
    this.emit();
  }

  private emit() {
    this.rangeChange.emit({ min: this.valueMin(), max: this.valueMax() });
  }

  private toPct(value: number): number {
    const range = this.max() - this.min();
    return range === 0 ? 0 : ((value - this.min()) / range) * 100;
  }
}
