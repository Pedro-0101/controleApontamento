import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
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

  // Track current route
  private navigationEnd$ = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd)
  );

  private currentRoute = toSignal(this.navigationEnd$, {
    initialValue: null
  });

  // Hide sidebar on login/auth pages
  showSidebar = computed(() => {
    const route = this.currentRoute();
    if (!route) return false;

    const url = route.urlAfterRedirects || route.url;
    return !url.includes('/login') && !url.includes('/401') && !url.includes('/404');
  });
}
