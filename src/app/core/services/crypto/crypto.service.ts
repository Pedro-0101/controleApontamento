import { inject, Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../../environments/environment';
import { LoggerService } from '../logger/logger.service';

@Injectable({
  providedIn: 'root',
})
export class CryptoService {

  private logger = inject(LoggerService);

  private cryptoKey: string = environment.cryptoKey;

  constructor() {
    this.logger.info("CryptoService", "Componente inicializado");
  }

  encryptPayload(data: unknown): string {
    const jsonData = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonData, this.cryptoKey).toString();
  }

  decryptPayload(ciphertext: string): unknown {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.cryptoKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    try {
      return JSON.parse(decrypted);
    } catch (e) {
      return null;
    }
  }
  
}
