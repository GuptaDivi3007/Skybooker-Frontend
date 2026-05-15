import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { ApiService } from './api.service';
import { Airport, FareSummary, Flight, Seat, User } from './models';

class ApiServiceMock {
  currentUser = signal<User | null>(null);
  login = jest.fn();
  requestRegistrationOtp = jest.fn();
  verifyRegistrationOtp = jest.fn();
  logout = jest.fn(() => this.currentUser.set(null));
  completeOAuthLogin = jest.fn();
  updateProfile = jest.fn();
  searchFlights = jest.fn();
  getSeatMap = jest.fn();
  holdSeat = jest.fn();
  releaseSeat = jest.fn();
  calculateFare = jest.fn();
  createBooking = jest.fn();
  createRazorpayOrder = jest.fn();
  verifyRazorpayPayment = jest.fn();
  getBookings = jest.fn();
  getAllFlights = jest.fn(() => of([]));
  getAllAirlines = jest.fn(() => of([]));
  getAllAirports = jest.fn(() => of([]));
  getAllUsers = jest.fn(() => of([]));
  getBookingsByFlight = jest.fn();
  getBookingByPnr = jest.fn();
}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let api: ApiServiceMock;

  const flight: Flight = {
    flightId: 'FLT-1',
    flightNumber: 'SB101',
    airlineId: 'AIR-1',
    originAirportCode: 'DEL',
    destinationAirportCode: 'BOM',
    departureTime: '2026-06-01T10:00:00',
    arrivalTime: '2026-06-01T12:00:00',
    durationMinutes: 120,
    status: 'ON_TIME',
    aircraftType: 'Airbus A320',
    totalSeats: 180,
    availableSeats: 4,
    basePrice: 4500
  };

  const seatA: Seat = {
    seatId: 'seat-a',
    flightId: 'FLT-1',
    seatNumber: '1A',
    seatClass: 'ECONOMY',
    rowNumber: 1,
    columnLetter: 'A',
    windowSeat: true,
    aisleSeat: false,
    extraLegroom: true,
    status: 'AVAILABLE',
    priceMultiplier: 1
  };

  const seatB: Seat = {
    ...seatA,
    seatId: 'seat-b',
    seatNumber: '1B',
    columnLetter: 'B',
    windowSeat: false
  };

  const airports: Airport[] = [
    {
      airportId: 'airport-1',
      name: 'Netaji Subhas Chandra Bose International',
      iataCode: 'CCU',
      city: 'Kolkata',
      active: true
    },
    {
      airportId: 'airport-2',
      name: 'Inactive Airport',
      iataCode: 'ZZZ',
      city: 'Hidden',
      active: false
    }
  ];

  beforeEach(async () => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: ApiService, useClass: ApiServiceMock }]
    })
      .overrideComponent(AppComponent, {
        set: { template: '' }
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    api = TestBed.inject(ApiService) as unknown as ApiServiceMock;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('shows useful validation message for travel dates beyond three months', () => {
    component.searchForm.patchValue({ departureDate: '2099-01-01' });

    component.search();

    expect(component.error()).toBe('Passengers can book flights only within the next 3 months.');
    expect(api.searchFlights).not.toHaveBeenCalled();
  });

  it('searches flights and opens results page', () => {
    api.searchFlights.mockReturnValue(of([flight]));
    component.searchForm.patchValue({
      originAirportCode: 'del',
      destinationAirportCode: 'bom',
      departureDate: component.today(),
      passengers: 2
    });

    component.search();

    expect(api.searchFlights).toHaveBeenCalledWith({
      originAirportCode: 'DEL',
      destinationAirportCode: 'BOM',
      departureDate: component.today(),
      passengers: 2
    });
    expect(component.flights()).toEqual([flight]);
    expect(component.step()).toBe('results');
  });

  it('loads active airport options from backend for search dropdowns', () => {
    api.getAllAirports.mockReturnValue(of(airports));

    component['loadAirportOptions']();

    expect(component.airportOptions()).toEqual([
      {
        code: 'CCU',
        city: 'Kolkata',
        name: 'Netaji Subhas Chandra Bose International'
      }
    ]);
  });

  it('redirects unauthenticated traveller to login when booking a flight', () => {
    component.chooseFlight(flight);

    expect(component.pendingFlight()).toEqual(flight);
    expect(component.authMode()).toBe('login');
    expect(component.step()).toBe('auth');
    expect(component.toast()).toContain('Sign in or create an account');
  });

  it('blocks flight selection when selected passengers exceed available seats', () => {
    component.searchForm.patchValue({ passengers: 5 });

    component.chooseFlight({ ...flight, availableSeats: 2 });

    expect(component.error()).toContain('Not enough seats available in this flight');
    expect(component.selectedFlight()).toBeNull();
  });

  it('allows replacing a selected seat before final review', () => {
    api.currentUser.set({
      userId: 'user-1',
      fullName: 'Divya',
      email: 'divya@test.com',
      role: 'PASSENGER',
      active: true
    });
    api.holdSeat.mockImplementation((seatId: string) => of(seatId === 'seat-a' ? { ...seatA, status: 'HELD' } : { ...seatB, status: 'HELD' }));
    api.releaseSeat.mockImplementation((seatId: string) => of(seatId === 'seat-a' ? seatA : seatB));
    component.searchForm.patchValue({ passengers: 1 });
    component.seats.set([seatA, seatB]);

    component.toggleSeat(seatA);
    component.toggleSeat(seatB);

    expect(api.releaseSeat).toHaveBeenCalledWith('seat-a');
    expect(component.selectedSeats()).toEqual([{ ...seatB, status: 'HELD' }]);
    expect(component.toast()).toBe('Seat selection updated.');
  });

  it('uses estimated fare when fare service fails during review', () => {
    api.calculateFare.mockReturnValue(throwError(() => new Error('fare down')));
    component.selectedFlight.set(flight);
    component.searchForm.patchValue({ passengers: 1 });
    component.detailsForm.patchValue({ mealPreference: 'NONE', luggageKg: 0 });
    component.selectedSeats.set([{ ...seatA, status: 'HELD' }]);

    component.prepareReview();

    const fare = component.fare() as FareSummary;
    expect(fare.totalFare).toBe(5040);
    expect(component.step()).toBe('review');
    expect(component.toast()).toContain('Using estimated fare');
  });

  it('toggles light and dark theme in local storage', () => {
    expect(component.theme()).toBe('light');

    component.toggleTheme();

    expect(component.theme()).toBe('dark');
    expect(localStorage.getItem('skybooker_theme')).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('formats flight schedule time without adding browser timezone offset', () => {
    expect(component.displayFlightDateTime('2026-05-30T06:00:00Z', 'card')).toContain('6:00 am');
    expect(component.displayFlightDateTime('2026-05-30T18:00:00.000000', 'card')).toContain('6:00 pm');
  });
});
