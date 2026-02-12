import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-card-faltas',
  imports: [LucideAngularModule],
  templateUrl: './card-faltas.html',
  styleUrl: './card-faltas.css',
})
export class CardFaltas {
  total = input<number>(0);
}
