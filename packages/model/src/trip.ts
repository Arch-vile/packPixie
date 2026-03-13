export interface Trip {
  tripId: string;
  tripName: string;
  createdAt: string;
  participants: string[];
}

export interface CreateTripRequest {
  tripName: string;
  userEmail: string;
  participantEmails: string[];
}

export interface CreateTripResponse {
  tripId: string;
  tripName: string;
  createdAt: string;
}

export interface GetTripsResponse {
  trips: Trip[];
}
