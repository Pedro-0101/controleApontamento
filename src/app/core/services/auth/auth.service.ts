import { inject, Injectable, signal } from '@angular/core';
import { LoggerService } from '../logger/logger.service';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private logger = inject(LoggerService);
  private users = environment.dnpAccessCode;
  userName = signal('');

}
