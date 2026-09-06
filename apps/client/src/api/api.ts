import type {
  StatusResponse,
  CreateTripResponse,
  GetTripsResponse,
  TripDetailResponse,
} from '@packpixie/model';
import { fetchAuthSession } from 'aws-amplify/auth';
import config from '../config';

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('Not authenticated');
  }
  return {
    Authorization: `Bearer ${idToken}`,
  };
}

export async function getApiStatus() {
  const response = await fetch(`${config.apiUrl}/api/status`);
  if (response.ok) {
    const status: StatusResponse = await response.json();
    return status;
  }
}

export async function getTrips(): Promise<GetTripsResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips`, { headers });
  if (!response.ok) {
    throw new Error('Failed to load trips');
  }
  return response.json();
}

export async function getTripDetail(tripId: string): Promise<TripDetailResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips/${tripId}`, { headers });
  if (response.status === 404) {
    throw new Error('Trip not found.');
  }
  if (!response.ok) {
    throw new Error('Failed to load trip.');
  }
  return response.json();
}

export async function createTrip(
  tripName: string,
  participantEmails: string[],
): Promise<CreateTripResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripName, participantEmails }),
  });
  if (!response.ok) {
    throw new Error('Failed to create trip');
  }
  return response.json();
}
