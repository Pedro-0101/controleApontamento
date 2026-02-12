import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-unauthorized',
  imports: [LucideAngularModule],
  templateUrl: './unauthorized.html',
  styleUrl: './unauthorized.css',
})
export class Unauthorized {
  private router = inject(Router);

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
