import type {
  StatusResponse,
  CreateTripResponse,
  GetTripsResponse,
} from '@packpixie/model';
import config from '../config';

export async function getApiStatus() {
  const response = await fetch(`${config.apiUrl}/api/status`);
  if (response.ok) {
    const status: StatusResponse = await response.json();
    return status;
  }
}

export async function getTrips(userEmail: string): Promise<GetTripsResponse> {
  const response = await fetch(
    `${config.apiUrl}/api/trips?userEmail=${encodeURIComponent(userEmail)}`,
  );
  if (!response.ok) {
    throw new Error('Failed to load trips');
  }
  return response.json();
}

export async function createTrip(
  userEmail: string,
  tripName: string,
  participantEmails: string[],
): Promise<CreateTripResponse> {
  const response = await fetch(`${config.apiUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail, tripName, participantEmails }),
  });
  if (!response.ok) {
    throw new Error('Failed to create trip');
  }
  return response.json();
}
