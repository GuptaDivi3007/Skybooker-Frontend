import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../environments/environment';
import {
  AuthResponse,
  Airline,
  Booking,
  BookingRequest,
  FareSummary,
  Flight,
  FlightSearchRequest,
  NotificationItem,
  Payment,
  RazorpayOrder,
  RegistrationOtpResponse,
  RazorpayVerifyRequest,
  Seat,
  SeatMap,
  User
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl;
  readonly currentUser = signal<User | null>(this.loadUser());

  constructor(private readonly http: HttpClient) {}

  register(payload: Record<string, unknown>) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, payload).pipe(
      tap((res) => this.persistAuth(res))
    );
  }

  requestRegistrationOtp(payload: Record<string, unknown>) {
    return this.http.post<RegistrationOtpResponse>(`${this.baseUrl}/auth/register/request-otp`, payload);
  }

  verifyRegistrationOtp(payload: { registrationToken: string; otp: string }) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register/verify-otp`, payload).pipe(
      tap((res) => this.persistAuth(res))
    );
  }

  login(payload: { email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, payload).pipe(
      tap((res) => this.persistAuth(res))
    );
  }

  logout() {
    localStorage.removeItem('skybooker_token');
    localStorage.removeItem('skybooker_refresh');
    localStorage.removeItem('skybooker_user');
    this.currentUser.set(null);
  }

  completeOAuthLogin(accessToken: string, refreshToken: string) {
    localStorage.setItem('skybooker_token', accessToken);
    localStorage.setItem('skybooker_refresh', refreshToken);
    return this.getProfile().pipe(
      tap((user) => {
        localStorage.setItem('skybooker_user', JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  getProfile() {
    return this.http.get<User>(`${this.baseUrl}/auth/profile`);
  }

  updateProfile(payload: { fullName: string; phone: string; passportNumber: string; nationality: string }) {
    return this.http.put<User>(`${this.baseUrl}/auth/profile`, payload).pipe(
      tap((user) => {
        localStorage.setItem('skybooker_user', JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  searchFlights(payload: FlightSearchRequest) {
    return this.http.post<Flight[]>(`${this.baseUrl}/flights/search`, payload);
  }

  getAllFlights() {
    return this.http.get<Flight[]>(`${this.baseUrl}/flights`);
  }

  getAllAirlines() {
    return this.http.get<Airline[]>(`${this.baseUrl}/airlines`);
  }

  getSeatMap(flightId: string) {
    return this.http.get<SeatMap>(`${this.baseUrl}/seats/flight/${flightId}/map`);
  }

  holdSeat(seatId: string) {
    return this.http.put<Seat>(`${this.baseUrl}/seats/${seatId}/hold`, {});
  }

  releaseSeat(seatId: string) {
    return this.http.put<Seat>(`${this.baseUrl}/seats/${seatId}/release`, {});
  }

  calculateFare(payload: { flightId: string; passengerCount: number; mealPreference: string; luggageKg: number }) {
    return this.http.post<FareSummary>(`${this.baseUrl}/bookings/fare`, payload);
  }

  createBooking(payload: BookingRequest) {
    return this.http.post<Booking>(`${this.baseUrl}/bookings`, payload);
  }

  confirmBooking(bookingId: string) {
    return this.http.put<Booking>(`${this.baseUrl}/bookings/${bookingId}/confirm`, {});
  }

  createPayment(payload: { bookingId: string; amount: number }) {
    return this.http.post<Payment>(`${this.baseUrl}/payments`, payload);
  }

  processPayment(paymentId: string, paymentMethod: string) {
    return this.http.put<Payment>(`${this.baseUrl}/payments/${paymentId}/process`, { paymentMethod });
  }

  createRazorpayOrder(payload: { bookingId: string; amount: number }) {
    return this.http.post<RazorpayOrder>(`${this.baseUrl}/payments/razorpay/order`, payload);
  }

  verifyRazorpayPayment(payload: RazorpayVerifyRequest) {
    return this.http.post<Payment>(`${this.baseUrl}/payments/razorpay/verify`, payload);
  }

  getBookings() {
    return this.http.get<Booking[]>(`${this.baseUrl}/bookings`);
  }

  getBookingByPnr(pnr: string) {
    return this.http.get<Booking>(`${this.baseUrl}/bookings/pnr/${pnr}`);
  }

  getMyNotifications() {
    return this.http.get<NotificationItem[]>(`${this.baseUrl}/notifications/me`);
  }

  getAdminAppNotifications() {
    return this.http.get<NotificationItem[]>(`${this.baseUrl}/notifications/admin/app`);
  }

  private persistAuth(res: AuthResponse) {
    localStorage.setItem('skybooker_token', res.accessToken);
    localStorage.setItem('skybooker_refresh', res.refreshToken);
    localStorage.setItem('skybooker_user', JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem('skybooker_user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
