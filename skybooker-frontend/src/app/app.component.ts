import { CommonModule, CurrencyPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from './api.service';
import { environment } from '../environments/environment';
import { Airline, Airport, AirportOption, Booking, FareSummary, Flight, NotificationItem, Passenger, Seat, User } from './models';

type Step = 'search' | 'auth' | 'profile' | 'operations' | 'results' | 'passengers' | 'seats' | 'review' | 'payment' | 'trips';
type OpsOperation = 'airline' | 'airport' | 'flight' | 'seats' | 'flight-control' | 'bookings' | 'users';

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes: Record<string, string>;
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, TitleCasePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);

  readonly step = signal<Step>('search');
  readonly loading = signal(false);
  readonly toast = signal('');
  readonly error = signal('');
  readonly authMode = signal<'login' | 'register'>('login');
  readonly registrationToken = signal('');
  readonly otpSentTo = signal('');
  readonly theme = signal<'light' | 'dark'>(this.loadTheme());
  readonly pendingFlight = signal<Flight | null>(null);
  readonly profileMenuOpen = signal(false);
  readonly flights = signal<Flight[]>([]);
  readonly selectedFlight = signal<Flight | null>(null);
  readonly seats = signal<Seat[]>([]);
  readonly selectedSeats = signal<Seat[]>([]);
  readonly fare = signal<FareSummary | null>(null);
  readonly booking = signal<Booking | null>(null);
  readonly trips = signal<Booking[]>([]);
  readonly pnrResult = signal<Booking | null>(null);
  readonly tripFlights = signal<Record<string, Flight>>({});
  readonly tripAirlines = signal<Record<string, Airline>>({});
  readonly notifications = signal<NotificationItem[]>([]);
  readonly opsFlights = signal<Flight[]>([]);
  readonly opsAirlines = signal<Airline[]>([]);
  readonly opsAirports = signal<Airport[]>([]);
  readonly opsBookings = signal<Booking[]>([]);
  readonly opsUsers = signal<User[]>([]);
  readonly activeOperation = signal<OpsOperation>('flight');

  readonly user = computed(() => this.api.currentUser());
  readonly canManageOperations = computed(() => ['ADMIN', 'AIRLINE_STAFF'].includes(this.user()?.role ?? ''));
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly progress = computed(() => {
    const order: Step[] = ['search', 'results', 'passengers', 'seats', 'review', 'payment'];
    return Math.max(order.indexOf(this.step()), 0);
  });

  readonly authForm = this.fb.group({
    fullName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    phone: [''],
    passportNumber: [''],
    nationality: ['Indian']
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]]
  });

  readonly searchForm = this.fb.group({
    originAirportCode: ['DEL', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    destinationAirportCode: ['BOM', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    departureDate: [this.today(), [Validators.required, this.travelDateValidator.bind(this)]],
    passengers: [1, [Validators.required, Validators.min(1)]],
    tripType: ['ONE_WAY'],
    returnDate: ['', this.optionalTravelDateValidator.bind(this)]
  });

  private readonly fallbackAirportOptions: AirportOption[] = [
    { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International' },
    { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International' },
    { code: 'BLR', city: 'Bengaluru', name: 'Kempegowda International' },
    { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International' },
    { code: 'MAA', city: 'Chennai', name: 'Chennai International' }
  ];
  readonly airportOptions = signal<AirportOption[]>(this.fallbackAirportOptions);

  readonly detailsForm = this.fb.group({
    contactEmail: ['', [Validators.required, Validators.email]],
    contactPhone: ['', Validators.required],
    mealPreference: ['NONE'],
    luggageKg: [0, [Validators.min(0), Validators.max(60)]],
    passengers: this.fb.array([])
  });

  readonly paymentForm = this.fb.group({
    method: ['UPI', Validators.required],
    pnr: ['']
  });

  readonly profileForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]],
    phone: ['', Validators.maxLength(20)],
    passportNumber: ['', Validators.maxLength(30)],
    nationality: ['', Validators.maxLength(50)]
  });

  readonly airlineForm = this.fb.group({
    name: ['', Validators.required],
    iataCode: ['', Validators.required],
    icaoCode: [''],
    country: ['India'],
    contactEmail: [''],
    contactPhone: [''],
    logoUrl: ['']
  });

  readonly airportForm = this.fb.group({
    name: ['', Validators.required],
    iataCode: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    icaoCode: [''],
    city: [''],
    country: ['India'],
    timezone: ['Asia/Kolkata'],
    latitude: [null as number | null],
    longitude: [null as number | null]
  });

  readonly flightForm = this.fb.group({
    flightNumber: ['', Validators.required],
    airlineId: ['', Validators.required],
    originAirportCode: ['DEL', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    destinationAirportCode: ['BOM', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    departureTime: ['', Validators.required],
    arrivalTime: ['', Validators.required],
    aircraftType: ['Airbus A320', Validators.required],
    totalSeats: [180, [Validators.required, Validators.min(1)]],
    basePrice: [4500, [Validators.required, Validators.min(1)]]
  });

  readonly seatInventoryForm = this.fb.group({
    flightId: ['', Validators.required],
    rows: [30, [Validators.required, Validators.min(1)]],
    columns: ['A,B,C,D,E,F', Validators.required],
    seatClass: ['ECONOMY', Validators.required],
    priceMultiplier: [1, [Validators.required, Validators.min(0.1)]]
  });

  readonly opsFlightFilterForm = this.fb.group({
    flightId: [''],
    status: ['ON_TIME']
  });

  constructor() {
    this.syncPassengerForms(1);
    this.loadAirportOptions();
    document.documentElement.dataset['theme'] = this.theme();
    const user = this.user();
    if (user) {
      this.detailsForm.patchValue({ contactEmail: user.email, contactPhone: user.phone ?? '' });
      this.patchProfileForm(user);
    }
    if (!this.handleOAuthRedirect()) {
      this.restorePageFromUrl();
    }
    window.addEventListener('popstate', () => this.restorePageFromUrl());
    window.addEventListener('skybooker-auth-cleared', () => {
      this.api.logout();
      this.pendingFlight.set(this.selectedFlight());
      this.authMode.set('login');
      this.error.set('Your login session expired. Please sign in again to continue booking.');
      this.loading.set(false);
      this.goTo('auth', '/login');
    });
  }

  get passengerForms() {
    return this.detailsForm.controls.passengers as FormArray;
  }

  isOperationActive(operation: OpsOperation) {
    return this.activeOperation() === operation;
  }

  selectOperation(operation: OpsOperation) {
    this.activeOperation.set(operation);
  }

  displayFlightDateTime(value: string | null | undefined, format: 'short' | 'card' | 'fullDate' = 'card') {
    if (!value) {
      return '-';
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) {
      return value;
    }

    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

    if (format === 'fullDate') {
      return new Intl.DateTimeFormat('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(date);
    }

    const options: Intl.DateTimeFormatOptions = format === 'short'
      ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }
      : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true };

    return new Intl.DateTimeFormat('en-IN', options).format(date);
  }

  private loadAirportOptions() {
    this.api.getAllAirports().subscribe({
      next: (airports) => {
        const options = airports
          .filter((airport) => airport.active !== false)
          .map((airport) => ({
            code: airport.iataCode,
            city: airport.city || airport.name,
            name: airport.name
          }))
          .filter((airport) => !!airport.code && !!airport.city);

        this.airportOptions.set(options.length ? options : this.fallbackAirportOptions);
      },
      error: () => this.airportOptions.set(this.fallbackAirportOptions)
    });
  }

  authenticate() {
    this.clearMessages();
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const value = this.authForm.getRawValue();
    if (this.authMode() === 'register') {
      if (this.registrationToken()) {
        this.verifyRegistrationOtp();
        return;
      }

      this.api.requestRegistrationOtp(value).subscribe({
        next: (res) => {
          this.registrationToken.set(res.registrationToken);
          this.otpSentTo.set(value.email ?? '');
          this.toast.set(res.message);
          this.loading.set(false);
        },
        error: (err) => this.handleError(err, 'Could not send OTP. Check email and try again.')
      });
      return;
    }

    this.api.login({ email: value.email ?? '', password: value.password ?? '' }).subscribe({
      next: (res) => {
        this.detailsForm.patchValue({ contactEmail: res.user.email, contactPhone: res.user.phone ?? '' });
        this.toast.set(`Welcome, ${res.user.fullName}`);
        this.loading.set(false);
        const pending = this.pendingFlight();
        if (pending) {
          this.pendingFlight.set(null);
          this.chooseFlight(pending);
        } else if (['ADMIN', 'AIRLINE_STAFF'].includes(res.user.role)) {
          this.loadOperations();
        } else {
          this.goTo('search', '/');
        }
      },
      error: (err) => this.handleError(err, 'Authentication failed. Check credentials and backend services.')
    });
  }

  verifyRegistrationOtp() {
    this.clearMessages();
    if (!this.registrationToken()) {
      this.authenticate();
      return;
    }

    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      this.loading.set(false);
      this.error.set('Enter the 6-digit OTP sent to your email.');
      return;
    }

    this.loading.set(true);
    this.api.verifyRegistrationOtp({
      registrationToken: this.registrationToken(),
      otp: this.otpForm.value.otp ?? ''
    }).subscribe({
      next: (res) => {
        this.registrationToken.set('');
        this.otpSentTo.set('');
        this.otpForm.reset();
        this.detailsForm.patchValue({ contactEmail: res.user.email, contactPhone: res.user.phone ?? '' });
        this.toast.set(`Welcome, ${res.user.fullName}. Your email is verified.`);
        this.loading.set(false);
        const pending = this.pendingFlight();
        if (pending) {
          this.pendingFlight.set(null);
          this.chooseFlight(pending);
        } else if (['ADMIN', 'AIRLINE_STAFF'].includes(res.user.role)) {
          this.loadOperations();
        } else {
          this.goTo('search', '/');
        }
      },
      error: (err) => this.handleError(err, 'OTP verification failed.')
    });
  }

  resetRegistrationOtp() {
    this.registrationToken.set('');
    this.otpSentTo.set('');
    this.otpForm.reset();
  }

  switchAuthMode(mode: 'login' | 'register') {
    this.authMode.set(mode);
    this.resetRegistrationOtp();
    this.clearMessages();
  }

  continueWithGoogle() {
    window.location.href = `${this.apiBaseUrl()}/oauth2/authorization/google`;
  }

  search() {
    this.clearMessages();
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      this.error.set(this.searchValidationMessage());
      return;
    }

    const payload = {
      originAirportCode: this.searchForm.value.originAirportCode?.toUpperCase() ?? '',
      destinationAirportCode: this.searchForm.value.destinationAirportCode?.toUpperCase() ?? '',
      departureDate: this.searchForm.value.departureDate ?? this.today(),
      passengers: Number(this.searchForm.value.passengers ?? 1)
    };

    this.loading.set(true);
    this.api.searchFlights(payload).subscribe({
      next: (flights) => {
        this.flights.set(flights);
        this.syncPassengerForms(payload.passengers);
        this.goTo('results', '/flights');
        this.loading.set(false);
        if (!flights.length) {
          this.toast.set(
            'No scheduled flights found for this route and date. Try another date or airport code.'
          );
        }
      },
      error: (err) => this.handleError(err, 'Unable to search flights. Make sure gateway and services are running.')
    });
  }

  chooseFlight(flight: Flight) {
    const passengers = Number(this.searchForm.value.passengers ?? 1);

    if (flight.availableSeats < passengers) {
      this.error.set(
        `Not enough seats available in this flight. Only ${flight.availableSeats} seat${flight.availableSeats === 1 ? '' : 's'} left, but you selected ${passengers} passenger${passengers === 1 ? '' : 's'}.`
      );
      this.toast.set('');
      return;
    }

    if (!this.user()) {
      this.pendingFlight.set(flight);
      this.authMode.set('login');
      this.goTo('auth', '/login');
      this.toast.set('Sign in or create an account to continue booking this flight.');
      return;
    }

    this.selectedFlight.set(flight);
    this.selectedSeats.set([]);
    this.fare.set(null);
    this.goTo('passengers', '/passengers');
  }

  continueToSeats() {
    this.clearMessages();
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      this.error.set(this.passengerValidationMessage());
      return;
    }

    const flight = this.selectedFlight();
    if (!flight) {
      return;
    }

    this.loading.set(true);
    this.api.getSeatMap(flight.flightId).subscribe({
      next: (map) => {
        this.seats.set(map.seats);
        this.goTo('seats', '/seats');
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Seat map is unavailable for this flight.')
    });
  }

  toggleSeat(seat: Seat) {
    const current = this.selectedSeats();
    const exists = current.some((item) => item.seatId === seat.seatId);

    if (exists) {
      this.selectedSeats.set(current.filter((item) => item.seatId !== seat.seatId));
      this.releaseHeldSeat(seat);
      return;
    }

    if (seat.status !== 'AVAILABLE') {
      this.toast.set('This seat is not available. Please choose another seat.');
      return;
    }

    const max = Number(this.searchForm.value.passengers ?? 1);
    const seatsToReplace = current.length >= max ? current.slice(0, current.length - max + 1) : [];
    const remaining = current.filter((item) => !seatsToReplace.some((oldSeat) => oldSeat.seatId === item.seatId));

    seatsToReplace.forEach((oldSeat) => this.releaseHeldSeat(oldSeat));

    this.api.holdSeat(seat.seatId).subscribe({
      next: (held) => {
        this.selectedSeats.set([...remaining, held]);
        this.seats.update((items) => items.map((item) => item.seatId === held.seatId ? held : item));
        if (seatsToReplace.length) {
          this.toast.set('Seat selection updated.');
        }
      },
      error: () => {
        this.toast.set('Seat could not be held, but it is selected locally for review.');
        this.selectedSeats.set([...remaining, seat]);
      }
    });
  }

  prepareReview() {
    this.clearMessages();
    const passengerCount = Number(this.searchForm.value.passengers ?? 1);
    if (this.selectedSeats().length !== passengerCount) {
      this.error.set(`Please select ${passengerCount} seat${passengerCount > 1 ? 's' : ''}.`);
      return;
    }

    const flight = this.selectedFlight();
    if (!flight) {
      return;
    }

    this.loading.set(true);
    this.api.calculateFare({
      flightId: flight.flightId,
      passengerCount,
      mealPreference: this.detailsForm.value.mealPreference ?? 'NONE',
      luggageKg: Number(this.detailsForm.value.luggageKg ?? 0)
    }).subscribe({
      next: (fare) => {
        this.fare.set(fare);
        this.goTo('review', '/review');
        this.loading.set(false);
      },
      error: () => {
        const estimated = this.estimateFare(flight, passengerCount);
        this.fare.set(estimated);
        this.goTo('review', '/review');
        this.loading.set(false);
        this.toast.set('Using estimated fare because fare service did not respond.');
      }
    });
  }

  createBooking() {
    this.clearMessages();
    const flight = this.selectedFlight();
    if (!flight || !this.detailsForm.valid) {
      return;
    }

    const payload = {
      flightId: flight.flightId,
      seatIds: this.selectedSeats().map((seat) => seat.seatId),
      tripType: this.searchForm.value.tripType as 'ONE_WAY',
      passengerCount: Number(this.searchForm.value.passengers ?? 1),
      passengers: this.passengerForms.getRawValue() as Passenger[],
      mealPreference: this.detailsForm.value.mealPreference as 'NONE',
      luggageKg: Number(this.detailsForm.value.luggageKg ?? 0),
      contactEmail: this.detailsForm.value.contactEmail ?? '',
      contactPhone: this.detailsForm.value.contactPhone ?? ''
    };

    this.loading.set(true);
    this.api.createBooking(payload).subscribe({
      next: (booking) => {
        this.booking.set(booking);
        this.goTo('payment', '/payment');
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Booking could not be created. Review passengers and seats.')
    });
  }

  pay() {
    const booking = this.booking();
    const fare = this.fare();
    if (!booking || !fare) {
      return;
    }

    this.clearMessages();
    this.loading.set(true);
    this.api.createRazorpayOrder({ bookingId: booking.bookingId, amount: fare.totalFare }).subscribe({
      next: (order) => {
        this.loadRazorpayCheckout()
          .then(() => {
            if (!window.Razorpay) {
              throw new Error('Razorpay checkout is unavailable');
            }

            this.loading.set(false);
            new window.Razorpay({
              key: order.razorpayKeyId,
              amount: order.amountInPaise,
              currency: order.currency,
              name: 'SkyBooker',
              description: `Booking ${booking.pnrCode}`,
              order_id: order.razorpayOrderId,
              prefill: {
                name: this.user()?.fullName,
                email: booking.contactEmail,
                contact: booking.contactPhone
              },
              notes: {
                bookingId: booking.bookingId,
                pnr: booking.pnrCode
              },
              theme: { color: '#0878ff' },
              handler: (response) => this.verifyRazorpay(order.paymentId, response),
              modal: {
                ondismiss: () => {
                  this.loading.set(false);
                  this.toast.set('Payment cancelled. Your booking is still pending.');
                }
              }
            }).open();
          })
          .catch(() => this.handleError(null, 'Unable to load Razorpay checkout. Check internet connection.'));
      },
      error: (err) => this.handleError(err, 'Razorpay payment order could not be created.')
    });
  }

  verifyRazorpay(paymentId: string, response: RazorpayResponse) {
    const booking = this.booking();
    if (!booking) {
      return;
    }

    this.loading.set(true);
    this.api.verifyRazorpayPayment({
      paymentId,
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
      paymentMethod: this.paymentForm.value.method ?? 'UPI'
    }).subscribe({
      next: (verifiedPayment) => {
        this.booking.set({
          ...booking,
          status: 'CONFIRMED',
          paymentId: verifiedPayment.paymentId
        });
        this.toast.set(`Ticket booked successfully. PNR ${booking.pnrCode}`);
        this.loadNotifications();
        window.setTimeout(() => this.loadNotifications(), 1500);
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Razorpay payment verification failed.')
    });
  }

  downloadTicketPdf() {
    this.openTicketDocument('ticket');
  }

  downloadBoardingPass() {
    this.openTicketDocument('boarding-pass');
  }

  private openTicketDocument(kind: 'ticket' | 'boarding-pass') {
    const booking = this.booking();
    const flight = this.selectedFlight();
    const fare = this.fare();

    if (!booking || !flight || !fare) {
      return;
    }

    const passengerNames = this.passengerForms.getRawValue()
      .map((p) => `${p.title} ${p.firstName} ${p.lastName}`)
      .join(', ');

    const title = kind === 'ticket' ? 'SkyBooker E-Ticket' : 'SkyBooker Boarding Pass';
    const subtitle = kind === 'ticket' ? 'Ticket booked successfully' : 'Ready for airport check-in';
    const ticketWindow = window.open('', '_blank', 'width=900,height=700');
    if (!ticketWindow) {
      this.error.set('Popup blocked. Please allow popups to download ticket PDF.');
      return;
    }

    ticketWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>SkyBooker Ticket ${booking.pnrCode}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #07172d; }
            .ticket { border: 1px solid #cdddf2; border-radius: 18px; padding: 28px; }
            h1 { margin: 0 0 8px; }
            .muted { color: #5d6b7f; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
            .box { border: 1px solid #d8e6f8; border-radius: 12px; padding: 14px; }
            .total { font-size: 24px; font-weight: 800; }
            @media print { button { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Download / Save as PDF</button>
          <div class="ticket">
            <h1>${title}</h1>
            <p class="muted">${subtitle}</p>
            <div class="grid">
              <div class="box"><strong>PNR</strong><br>${booking.pnrCode}</div>
              <div class="box"><strong>Booking ID</strong><br>${booking.bookingId}</div>
              <div class="box"><strong>Flight</strong><br>${flight.flightNumber}</div>
              <div class="box"><strong>Route</strong><br>${flight.originAirportCode} to ${flight.destinationAirportCode}</div>
              <div class="box"><strong>Departure</strong><br>${this.displayFlightDateTime(flight.departureTime, 'card')}</div>
              <div class="box"><strong>Seats</strong><br>${booking.seatIds.join(', ')}</div>
              <div class="box"><strong>Passengers</strong><br>${passengerNames}</div>
              <div class="box"><strong>Status</strong><br>${booking.status}</div>
            </div>
            <p class="total">Total paid: INR ${fare.totalFare.toFixed(2)}</p>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    ticketWindow.document.close();
  }

  loadNotifications() {
    if (!this.user()) {
      return;
    }

    const request = this.user()?.role === 'ADMIN'
      ? this.api.getAdminAppNotifications()
      : this.api.getMyNotifications();

    request.subscribe({
      next: (items) => this.notifications.set(items.slice(0, 5)),
      error: () => this.notifications.set([])
    });
  }

  loadTrips() {
    this.clearMessages();
    if (!this.user()) {
      this.goTo('auth', '/login');
      return;
    }

    this.goTo('trips', '/trips');
    this.loading.set(true);
    this.api.getAllFlights().subscribe({
      next: (flights) => {
        this.tripFlights.set(Object.fromEntries(flights.map((flight) => [flight.flightId, flight])));
      },
      error: () => this.tripFlights.set({})
    });
    this.api.getAllAirlines().subscribe({
      next: (airlines) => {
        this.tripAirlines.set(Object.fromEntries(airlines.map((airline) => [airline.airlineId, airline])));
      },
      error: () => this.tripAirlines.set({})
    });

    this.api.getBookings().subscribe({
      next: (bookings) => {
        this.trips.set(bookings);
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Could not load your bookings.')
    });
  }

  loadOperations() {
    this.clearMessages();
    if (!this.canManageOperations()) {
      this.goTo('auth', '/login');
      return;
    }

    if (!this.isAdmin() && ['airline', 'airport', 'users'].includes(this.activeOperation())) {
      this.activeOperation.set('flight');
    }

    this.goTo('operations', '/operations');
    this.loading.set(true);
    this.api.getAllFlights().subscribe({
      next: (flights) => {
        this.opsFlights.set(flights);
        if (!this.flightForm.value.airlineId && this.opsAirlines().length) {
          this.flightForm.patchValue({ airlineId: this.opsAirlines()[0].airlineId });
        }
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Could not load flight operations.')
    });
    this.api.getAllAirlines().subscribe({
      next: (airlines) => {
        this.opsAirlines.set(airlines);
        if (!this.flightForm.value.airlineId && airlines.length) {
          this.flightForm.patchValue({ airlineId: airlines[0].airlineId });
        }
      },
      error: () => this.opsAirlines.set([])
    });
    this.api.getAllAirports().subscribe({
      next: (airports) => this.opsAirports.set(airports),
      error: () => this.opsAirports.set([])
    });
    if (this.isAdmin()) {
      this.api.getAllUsers().subscribe({
        next: (users) => this.opsUsers.set(users),
        error: () => this.opsUsers.set([])
      });
    }
  }

  createAirline() {
    this.clearMessages();
    if (!this.isAdmin() || this.airlineForm.invalid) {
      this.airlineForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.api.createAirline(this.cleanPayload(this.airlineForm.getRawValue())).subscribe({
      next: () => {
        this.toast.set('Airline added successfully.');
        this.airlineForm.reset({ country: 'India' });
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Airline could not be added.')
    });
  }

  createAirport() {
    this.clearMessages();
    if (!this.isAdmin() || this.airportForm.invalid) {
      this.airportForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.api.createAirport(this.cleanPayload(this.airportForm.getRawValue())).subscribe({
      next: () => {
        this.toast.set('Airport added successfully.');
        this.airportForm.reset({ country: 'India', timezone: 'Asia/Kolkata' });
        this.loadAirportOptions();
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Airport could not be added.')
    });
  }

  createFlight() {
    this.clearMessages();
    if (!this.canManageOperations() || this.flightForm.invalid) {
      this.flightForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.api.createFlight(this.cleanPayload(this.flightForm.getRawValue())).subscribe({
      next: () => {
        this.toast.set('Flight added successfully. Add seat inventory before opening bookings.');
        this.flightForm.patchValue({ flightNumber: '', departureTime: '', arrivalTime: '' });
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Flight could not be added.')
    });
  }

  updateOpsFlightStatus(flightId: string) {
    const status = this.opsFlightFilterForm.value.status ?? 'ON_TIME';
    this.loading.set(true);
    this.api.updateFlightStatus(flightId, status).subscribe({
      next: () => {
        this.toast.set(`Flight status changed to ${status}.`);
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Flight status could not be updated.')
    });
  }

  deleteOpsFlight(flightId: string) {
    this.loading.set(true);
    this.api.deleteFlight(flightId).subscribe({
      next: () => {
        this.toast.set('Flight deleted successfully.');
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Flight could not be deleted.')
    });
  }

  addSeatInventory() {
    this.clearMessages();
    if (!this.canManageOperations() || this.seatInventoryForm.invalid) {
      this.seatInventoryForm.markAllAsTouched();
      return;
    }

    const value = this.seatInventoryForm.getRawValue();
    const columns = (value.columns ?? 'A,B,C,D,E,F')
      .split(',')
      .map((column) => column.trim().toUpperCase())
      .filter(Boolean);
    const seats = Array.from({ length: Number(value.rows ?? 0) }, (_, index) => index + 1)
      .flatMap((rowNumber) => columns.map((columnLetter, index) => ({
        seatNumber: `${rowNumber}${columnLetter}`,
        seatClass: value.seatClass,
        rowNumber,
        columnLetter,
        windowSeat: index === 0 || index === columns.length - 1,
        aisleSeat: index === 2 || index === 3,
        extraLegroom: rowNumber <= 2,
        priceMultiplier: Number(value.priceMultiplier ?? 1),
        status: 'AVAILABLE'
      })));

    this.loading.set(true);
    this.api.addSeatsForFlight(value.flightId ?? '', seats).subscribe({
      next: () => {
        this.toast.set(`${seats.length} seats added for this flight.`);
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Seat inventory could not be added.')
    });
  }

  releaseExpiredHolds() {
    this.loading.set(true);
    this.api.releaseExpiredSeats().subscribe({
      next: (res) => {
        this.toast.set(res.message);
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'Expired holds could not be released.')
    });
  }

  loadFlightBookings() {
    const flightId = this.opsFlightFilterForm.value.flightId;
    if (!flightId) {
      this.error.set('Select a flight to view bookings.');
      return;
    }

    this.activeOperation.set('bookings');
    this.loading.set(true);
    this.api.getBookingsByFlight(flightId).subscribe({
      next: (bookings) => {
        this.opsBookings.set(bookings);
        this.loading.set(false);
      },
      error: (err) => this.handleError(err, 'Could not load bookings for this flight.')
    });
  }

  toggleUserActive(user: User) {
    const request = user.active ? this.api.suspendUser(user.userId) : this.api.reactivateUser(user.userId);
    this.loading.set(true);
    request.subscribe({
      next: (res) => {
        this.toast.set(res.message);
        this.loadOperations();
      },
      error: (err) => this.handleError(err, 'User status could not be changed.')
    });
  }

  findPnr() {
    const pnr = this.paymentForm.value.pnr?.trim();
    if (!pnr) {
      return;
    }

    this.api.getBookingByPnr(pnr).subscribe({
      next: (booking) => this.pnrResult.set(booking),
      error: () => this.error.set('No booking found for that PNR.')
    });
  }

  logout() {
    this.api.logout();
    this.profileMenuOpen.set(false);
    this.goTo('search', '/');
    this.toast.set('Signed out successfully.');
  }

  openProfile() {
    const user = this.user();
    if (!user) {
      this.goTo('auth', '/login');
      return;
    }

    this.patchProfileForm(user);
    this.profileMenuOpen.set(false);
    this.goTo('profile', '/profile');
  }

  saveProfile() {
    this.clearMessages();
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const value = this.profileForm.getRawValue();
    this.loading.set(true);
    this.api.updateProfile({
      fullName: value.fullName ?? '',
      phone: value.phone ?? '',
      passportNumber: value.passportNumber ?? '',
      nationality: value.nationality ?? ''
    }).subscribe({
      next: (user) => {
        this.detailsForm.patchValue({ contactEmail: user.email, contactPhone: user.phone ?? '' });
        this.syncPassengerForms(Number(this.searchForm.value.passengers ?? 1));
        this.toast.set('Profile updated successfully.');
        this.loading.set(false);
        this.goTo('search', '/');
      },
      error: (err) => this.handleError(err, 'Profile update failed.')
    });
  }

  toggleTheme() {
    const next = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    localStorage.setItem('skybooker_theme', next);
    document.documentElement.dataset['theme'] = next;
  }

  seatColumns(row: number) {
    return this.seats().filter((seat) => seat.rowNumber === row).sort((a, b) => a.columnLetter.localeCompare(b.columnLetter));
  }

  rows() {
    return [...new Set(this.seats().map((seat) => seat.rowNumber))].sort((a, b) => a - b);
  }

  seatClass(seat: Seat) {
    const selected = this.selectedSeats().some((item) => item.seatId === seat.seatId);
    return {
      selected,
      unavailable: seat.status !== 'AVAILABLE' && !selected,
      premium: seat.seatClass !== 'ECONOMY'
    };
  }

  private releaseHeldSeat(seat: Seat) {
    this.seats.update((items) => items.map((item) => {
      if (item.seatId !== seat.seatId) {
        return item;
      }

      return { ...item, status: 'AVAILABLE' };
    }));

    this.api.releaseSeat(seat.seatId).subscribe({
      next: (released) => {
        this.seats.update((items) => items.map((item) => item.seatId === released.seatId ? released : item));
      },
      error: () => {
        // Local selection is still cleared so the traveller can continue changing seats.
      }
    });
  }

  duration(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  private syncPassengerForms(count: number) {
    this.passengerForms.clear();
    const user = this.user();
    for (let i = 0; i < count; i += 1) {
      this.passengerForms.push(this.fb.group({
        title: [i === 0 ? 'Mr' : 'Ms', Validators.required],
        firstName: [i === 0 ? user?.fullName?.split(' ')[0] ?? '' : '', Validators.required],
        lastName: [i === 0 ? user?.fullName?.split(' ').slice(1).join(' ') ?? '' : '', Validators.required],
        dateOfBirth: ['1998-01-01', [Validators.required, this.pastOrTodayDateValidator.bind(this)]],
        gender: ['MALE', Validators.required],
        passportNumber: [i === 0 ? user?.passportNumber ?? '' : '', Validators.required],
        nationality: [i === 0 ? user?.nationality ?? 'Indian' : 'Indian', Validators.required],
        passportExpiry: ['2032-12-31', [Validators.required, this.futureOrTodayDateValidator.bind(this)]],
        passengerType: ['ADULT']
      }));
    }
  }

  private patchProfileForm(user: User) {
    this.profileForm.patchValue({
      fullName: user.fullName,
      phone: user.phone ?? '',
      passportNumber: user.passportNumber ?? '',
      nationality: user.nationality ?? ''
    });
  }

  private estimateFare(flight: Flight, passengers: number): FareSummary {
    const baseFare = flight.basePrice * passengers;
    const mealCost = (this.detailsForm.value.mealPreference === 'NONE' ? 0 : 450) * passengers;
    const baggageCost = Number(this.detailsForm.value.luggageKg ?? 0) * 180;
    const taxes = Math.round(baseFare * 0.12);
    return {
      flightId: flight.flightId,
      passengerCount: passengers,
      baseFare,
      taxes,
      mealCost,
      baggageCost,
      totalFare: baseFare + taxes + mealCost + baggageCost
    };
  }

  today() {
    return this.formatDate(new Date());
  }

  maxTravelDate() {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return this.formatDate(date);
  }

  private travelDateValidator(control: { value: string | null }) {
    if (!control.value) {
      return null;
    }

    if (control.value < this.today()) {
      return { pastDate: true };
    }

    if (control.value > this.maxTravelDate()) {
      return { dateTooFar: true };
    }

    return null;
  }

  private optionalTravelDateValidator(control: { value: string | null }) {
    if (!control.value) {
      return null;
    }

    return this.travelDateValidator(control);
  }

  private pastOrTodayDateValidator(control: { value: string | null }) {
    if (!control.value) {
      return null;
    }

    return control.value <= this.today() ? null : { futureDate: true };
  }

  private futureOrTodayDateValidator(control: { value: string | null }) {
    if (!control.value) {
      return null;
    }

    return control.value >= this.today() ? null : { pastDate: true };
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadTheme(): 'light' | 'dark' {
    return localStorage.getItem('skybooker_theme') === 'dark' ? 'dark' : 'light';
  }

  private clearMessages() {
    this.error.set('');
    this.toast.set('');
  }

  private searchValidationMessage() {
    const origin = this.searchForm.controls.originAirportCode;
    const destination = this.searchForm.controls.destinationAirportCode;
    const departureDate = this.searchForm.controls.departureDate;
    const passengers = this.searchForm.controls.passengers;

    if (departureDate.hasError('required')) {
      return 'Please select a departure date.';
    }

    if (departureDate.hasError('pastDate')) {
      return 'Please choose today or a future travel date.';
    }

    if (departureDate.hasError('dateTooFar')) {
      return 'Passengers can book flights only within the next 3 months.';
    }

    if (passengers.hasError('required')) {
      return 'Please enter passenger count.';
    }

    if (passengers.hasError('min')) {
      return 'At least 1 passenger is required.';
    }

    if (origin.invalid || destination.invalid) {
      return 'Airport codes must be exactly 3 letters, for example DEL or BOM.';
    }

    return 'Please correct the highlighted search details.';
  }

  private passengerValidationMessage() {
    for (const group of this.passengerForms.controls) {
      const dateOfBirth = group.get('dateOfBirth');
      const passportExpiry = group.get('passportExpiry');

      if (dateOfBirth?.hasError('futureDate')) {
        return 'Date of birth cannot be in the future.';
      }

      if (passportExpiry?.hasError('pastDate')) {
        return 'Passport expiry cannot be in the past.';
      }
    }

    return 'Please complete all required passenger details.';
  }

  tripFlight(booking: Booking | null | undefined) {
    if (!booking) {
      return null;
    }

    return this.tripFlights()[booking.flightId] ?? null;
  }

  tripRoute(booking: Booking | null | undefined) {
    const flight = this.tripFlight(booking);
    return flight ? `${flight.originAirportCode} to ${flight.destinationAirportCode}` : '-';
  }

  tripAirline(booking: Booking | null | undefined) {
    const flight = this.tripFlight(booking);
    if (!flight) {
      return 'Airline details unavailable';
    }

    const airline = this.tripAirlines()[flight.airlineId];
    return airline ? `${airline.name} (${airline.iataCode || airline.icaoCode || flight.airlineId})` : flight.airlineId;
  }

  private loadRazorpayCheckout() {
    if (window.Razorpay) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const scriptUrl = 'https://checkout.razorpay.com/v1/checkout.js';
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);

      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }

      const script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.body.appendChild(script);
    });
  }

  private handleOAuthRedirect() {
    if (window.location.pathname !== '/oauth2/success') {
      return false;
    }

    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      this.authMode.set('login');
      this.error.set('Google sign-in did not return a valid session. Please try again.');
      this.goTo('auth', '/login');
      return true;
    }

    this.loading.set(true);
    this.api.completeOAuthLogin(accessToken, refreshToken).subscribe({
      next: (user) => {
        this.detailsForm.patchValue({ contactEmail: user.email, contactPhone: user.phone ?? '' });
        this.patchProfileForm(user);
        this.toast.set(`Welcome, ${user.fullName}`);
        this.loading.set(false);
        window.history.replaceState({}, '', '/');
        const pending = this.pendingFlight();
        if (pending) {
          this.pendingFlight.set(null);
          this.chooseFlight(pending);
        } else if (['ADMIN', 'AIRLINE_STAFF'].includes(user.role)) {
          this.loadOperations();
        } else {
          this.goTo('search', '/');
        }
      },
      error: (err) => this.handleError(err, 'Google sign-in failed. Please try again.')
    });

    return true;
  }

  private apiBaseUrl() {
    return environment.apiBaseUrl;
  }

  goTo(step: Step, path: string) {
    this.step.set(step);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }

  private restorePageFromUrl() {
    const path = window.location.pathname;
    if (path === '/profile') {
      if (this.user()) {
        this.patchProfileForm(this.user()!);
        this.step.set('profile');
      } else {
        this.step.set('auth');
      }
      return;
    }

    if (path === '/trips') {
      if (this.user()) {
        this.loadTrips();
      } else {
        this.step.set('auth');
      }
      return;
    }

    if (path === '/operations') {
      if (this.canManageOperations()) {
        this.loadOperations();
      } else {
        this.step.set('auth');
      }
      return;
    }

    const pageMap: Record<string, Step> = {
      '/login': 'auth',
      '/flights': 'results',
      '/passengers': 'passengers',
      '/seats': 'seats',
      '/review': 'review',
      '/payment': 'payment'
    };
    this.step.set(pageMap[path] ?? 'search');
  }

  private handleError(err: unknown, fallback: string) {
    if (this.isUnauthorized(err)) {
      this.api.logout();
      this.pendingFlight.set(this.selectedFlight());
      this.authMode.set('login');
      this.error.set('Your login session expired. Please sign in again to continue booking.');
      this.loading.set(false);
      this.goTo('auth', '/login');
      return;
    }

    const message = this.extractMessage(err) || fallback;
    this.error.set(message);
    this.loading.set(false);
  }

  private isUnauthorized(err: unknown) {
    return typeof err === 'object' && err !== null && 'status' in err && (err as { status?: number }).status === 401;
  }

  private extractMessage(err: unknown) {
    if (typeof err === 'object' && err && 'error' in err) {
      const body = (err as { error?: { message?: string; error?: string } }).error;
      return body?.message ?? body?.error ?? '';
    }
    return '';
  }

  private cleanPayload<T extends Record<string, unknown>>(payload: T) {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return [key, trimmed === '' ? null : trimmed];
        }
        return [key, value];
      })
    );
  }
}
