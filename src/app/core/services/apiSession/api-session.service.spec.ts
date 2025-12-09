import { TestBed } from '@angular/core/testing';

import { ApiSessionService } from './api-session.service';

describe('ApiSessionService', () => {
  let service: ApiSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiSessionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
