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
      z-index: 9999;
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
      padding: 12px 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 300px;
      max-width: 450px;
      border-left: 4px solid #ccc;
    }

    .toast.success { border-left-color: #10b981; }
    .toast.error { border-left-color: #ef4444; }
    .toast.info { border-left-color: #3b82f6; }
    .toast.warning { border-left-color: #f59e0b; }

    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast.success .toast-icon { color: #10b981; }
    .toast.error .toast-icon { color: #ef4444; }
    .toast.info .toast-icon { color: #3b82f6; }
    .toast.warning .toast-icon { color: #f59e0b; }

    .toast-message {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .toast-close {
      background: transparent;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      display: flex;
      padding: 4px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .toast-close:hover {
      background: #f3f4f6;
      color: #374151;
    }
  `],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastComponent {
  toastService = inject(ToastService);
}
