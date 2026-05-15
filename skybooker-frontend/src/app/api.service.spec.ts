import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { AuthResponse, User } from './models';
import { environment } from '../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  const user: User = {
    userId: 'user-1',
    fullName: 'Divya',
    email: 'divya@test.com',
    phone: '9999999999',
    role: 'PASSENGER',
    active: true,
    passportNumber: 'P1234567',
    nationality: 'Indian'
  };

  const authResponse: AuthResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('persists auth data after login', () => {
    service.login({ email: 'divya@test.com', password: 'password123' }).subscribe((res) => {
      expect(res).toEqual(authResponse);
      expect(service.currentUser()).toEqual(user);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'divya@test.com', password: 'password123' });
    req.flush(authResponse);

    expect(localStorage.getItem('skybooker_token')).toBe('access-token');
    expect(localStorage.getItem('skybooker_refresh')).toBe('refresh-token');
    expect(JSON.parse(localStorage.getItem('skybooker_user') ?? '{}')).toEqual(user);
  });

  it('clears stored session on logout', () => {
    localStorage.setItem('skybooker_token', 'access-token');
    localStorage.setItem('skybooker_refresh', 'refresh-token');
    localStorage.setItem('skybooker_user', JSON.stringify(user));

    service.logout();

    expect(localStorage.getItem('skybooker_token')).toBeNull();
    expect(localStorage.getItem('skybooker_refresh')).toBeNull();
    expect(localStorage.getItem('skybooker_user')).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('calls flight search endpoint with provided payload', () => {
    const payload = {
      originAirportCode: 'DEL',
      destinationAirportCode: 'BOM',
      departureDate: '2026-06-01',
      passengers: 2
    };

    service.searchFlights(payload).subscribe((flights) => {
      expect(flights).toEqual([]);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/flights/search`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush([]);
  });

  it('loads seat map for selected flight', () => {
    service.getSeatMap('FLT-1').subscribe((map) => {
      expect(map.flightId).toBe('FLT-1');
      expect(map.availableSeats).toBe(1);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/seats/flight/FLT-1/map`);
    expect(req.request.method).toBe('GET');
    req.flush({
      flightId: 'FLT-1',
      totalSeats: 1,
      availableSeats: 1,
      heldSeats: 0,
      confirmedSeats: 0,
      blockedSeats: 0,
      seats: []
    });
  });

  it('updates current user after profile save', () => {
    const updated = { ...user, fullName: 'Divya Sharma', phone: '8888888888' };

    service.updateProfile({
      fullName: 'Divya Sharma',
      phone: '8888888888',
      passportNumber: 'P1234567',
      nationality: 'Indian'
    }).subscribe((res) => {
      expect(res.fullName).toBe('Divya Sharma');
      expect(service.currentUser()).toEqual(updated);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/profile`);
    expect(req.request.method).toBe('PUT');
    req.flush(updated);
  });
});
