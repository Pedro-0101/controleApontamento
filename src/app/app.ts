import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, NavigationStart, NavigationCancel, NavigationError } from '@angular/router';
import { Sidebar } from './core/sidebar/sidebar';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { ToastComponent } from './shared/toast/toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private router = inject(Router);

  isNavigating = signal(true);

  private navigationEnd$ = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd)
  );

  private currentRoute = toSignal(this.navigationEnd$, {
    initialValue: null
  });

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.isNavigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isNavigating.set(false);
      }
    });
  }

  showSidebar = computed(() => {
    const route = this.currentRoute();
    if (!route) return false;

    const url = route.urlAfterRedirects || route.url;
    return !url.includes('/login') && !url.includes('/401') && !url.includes('/404');
  });
}
