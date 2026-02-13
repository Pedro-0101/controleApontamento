import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast/toast.service';
import { LucideAngularModule } from 'lucide-angular';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.currentToasts(); track toast.id) {
        <div class="toast" [class]="toast.type" @slideInOut>
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') { <lucide-icon name="check-circle"></lucide-icon> }
              @case ('error') { <lucide-icon name="alert-circle"></lucide-icon> }
              @case ('warning') { <lucide-icon name="alert-triangle"></lucide-icon> }
              @default { <lucide-icon name="info"></lucide-icon> }
            }
          </div>
          <div class="toast-message">{{ toast.message }}</div>
          <button class="toast-close" (click)="toastService.remove(toast.id)">
            <lucide-icon name="x" size="16"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      min-width: 320px;
      max-width: 480px;
      border-left: 6px solid #ccc;
      transform-origin: right top;
    }

    .toast.success { border-left-color: var(--color-success, #10b981); }
    .toast.error { border-left-color: var(--color-danger, #ef4444); }
    .toast.info { border-left-color: var(--color-primary, #3b82f6); }
    .toast.warning { border-left-color: var(--color-warning, #f59e0b); }

    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast.success .toast-icon { color: var(--color-success, #10b981); }
    .toast.error .toast-icon { color: var(--color-danger, #ef4444); }
    .toast.info .toast-icon { color: var(--color-primary, #3b82f6); }
    .toast.warning .toast-icon { color: var(--color-warning, #f59e0b); }

    .toast-message {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-gray-800, #1f2937);
      line-height: 1.4;
    }

    .toast-close {
      background: transparent;
      border: none;
      color: var(--color-gray-400, #9ca3af);
      cursor: pointer;
      display: flex;
      padding: 4px;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .toast-close:hover {
      background: var(--color-gray-100, #f3f4f6);
      color: var(--color-gray-700, #374151);
    }
  `],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateX(100%) scale(0.9)', opacity: 0 }),
        animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ transform: 'translateX(0) scale(1)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastComponent {
  toastService = inject(ToastService);
}
