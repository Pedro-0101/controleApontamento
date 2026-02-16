import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './button.html',
  styleUrl: './button.css'
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'outline' | 'danger' | 'ghost' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() icon?: string;
  @Input() loading = false;
  @Input() disabled = false;
  @Input() type: 'button' | 'submit' = 'button';
  @Input() fullWidth = false;

  @Output() onClick = new EventEmitter<MouseEvent>();

  handleOnClick(event: MouseEvent) {
    if (!this.loading && !this.disabled) {
      this.onClick.emit(event);
    }
  }
}
