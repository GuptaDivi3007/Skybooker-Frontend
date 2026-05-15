export type Role = 'PASSENGER' | 'ADMIN' | 'AIRLINE_STAFF';
export type TripType = 'ONE_WAY' | 'ROUND_TRIP';
export type MealPreference = 'NONE' | 'VEG' | 'NON_VEG';
export type SeatStatus = 'AVAILABLE' | 'HELD' | 'CONFIRMED' | 'BLOCKED';

export interface User {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: Role;
  active: boolean;
  passportNumber?: string;
  nationality?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface RegistrationOtpResponse {
  message: string;
  registrationToken: string;
  expiresInMinutes: number;
}

export interface AirportOption {
  code: string;
  city: string;
  name: string;
}

export interface Airline {
  airlineId: string;
  name: string;
  iataCode?: string;
  icaoCode?: string;
  logoUrl?: string;
  country?: string;
  active: boolean;
}

export interface Airport {
  airportId: string;
  name: string;
  iataCode: string;
  icaoCode?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  active: boolean;
}

export interface Flight {
  flightId: string;
  flightNumber: string;
  airlineId: string;
  originAirportCode: string;
  destinationAirportCode: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  status: string;
  aircraftType: string;
  totalSeats: number;
  availableSeats: number;
  basePrice: number;
}

export interface FlightSearchRequest {
  originAirportCode: string;
  destinationAirportCode: string;
  departureDate: string;
  passengers: number;
}

export interface Seat {
  seatId: string;
  flightId: string;
  seatNumber: string;
  seatClass: 'ECONOMY' | 'BUSINESS' | 'FIRST';
  rowNumber: number;
  columnLetter: string;
  windowSeat: boolean;
  aisleSeat: boolean;
  extraLegroom: boolean;
  status: SeatStatus;
  priceMultiplier: number;
}

export interface SeatMap {
  flightId: string;
  totalSeats: number;
  availableSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  blockedSeats: number;
  seats: Seat[];
}

export interface Passenger {
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  passportNumber: string;
  nationality: string;
  passportExpiry: string;
  passengerType: string;
}

export interface BookingRequest {
  flightId: string;
  seatIds: string[];
  tripType: TripType;
  passengerCount: number;
  passengers: Passenger[];
  mealPreference: MealPreference;
  luggageKg: number;
  contactEmail: string;
  contactPhone: string;
}

export interface FareSummary {
  flightId: string;
  passengerCount: number;
  baseFare: number;
  taxes: number;
  mealCost: number;
  baggageCost: number;
  totalFare: number;
}

export interface Booking {
  bookingId: string;
  userId: string;
  flightId: string;
  pnrCode: string;
  tripType: TripType;
  status: string;
  seatIds: string[];
  passengerCount: number;
  baseFare: number;
  taxes: number;
  mealCost: number;
  baggageCost: number;
  totalFare: number;
  mealPreference: MealPreference;
  luggageKg: number;
  contactEmail: string;
  contactPhone: string;
  paymentId?: string;
  bookedAt: string;
  updatedAt: string;
}

export interface Payment {
  paymentId: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  transactionId?: string;
  paymentMethod?: string;
  createdAt: string;
}

export interface RazorpayOrder {
  paymentId: string;
  bookingId: string;
  userId: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  status: string;
  razorpayKeyId: string;
  razorpayOrderId: string;
  receipt: string;
  createdAt: string;
}

export interface RazorpayVerifyRequest {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  paymentMethod: string;
}

export interface NotificationItem {
  notificationId: string;
  userId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  status: string;
  readStatus: boolean;
  bookingId?: string;
  paymentId?: string;
  failureReason?: string;
  createdAt: string;
  sentAt?: string;
}

export interface MessageResponse {
  message: string;
}
