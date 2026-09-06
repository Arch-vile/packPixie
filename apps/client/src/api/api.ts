import type {
  StatusResponse,
  CreateTripResponse,
  GetTripsResponse,
  TripDetailResponse,
  Item,
  CreateItemRequest,
  PatchItemRequest,
} from '@packpixie/model';
import { fetchAuthSession } from 'aws-amplify/auth';
import config from '../config';

// Carries the server's exact 409 error message (Phase 7: the two
// invariant-protecting write races) so callers can special-case it — never a
// blind auto-retry, per 08-PATTERNS.md "Shared Patterns → Conflict Handling".
export class ConflictError extends Error {}

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

export async function createItem(
  tripId: string,
  body: CreateItemRequest,
): Promise<Item> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips/${tripId}/items`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error('Failed to add item.');
  }
  return response.json();
}

export async function patchItem(
  tripId: string,
  itemId: string,
  patch: PatchItemRequest,
): Promise<Item> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${config.apiUrl}/api/trips/${tripId}/items/${itemId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (response.status === 409) {
    const body = await response.json();
    throw new ConflictError(body.error);
  }
  if (!response.ok) {
    throw new Error('Failed to save changes.');
  }
  return response.json();
}

export async function deleteItem(tripId: string, itemId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${config.apiUrl}/api/trips/${tripId}/items/${itemId}`,
    {
      method: 'DELETE',
      headers,
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error('Failed to save changes.');
  }
}
