import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './nav.html',
  styleUrl: './nav.css',
})
export class Nav {}