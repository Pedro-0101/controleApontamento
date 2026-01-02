import { TestBed } from '@angular/core/testing';

import { RelogioService } from './relogio.service';

describe('RelogioService', () => {
  let service: RelogioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RelogioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
