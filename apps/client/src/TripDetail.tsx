import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TripDetailResponse } from '@packpixie/model';
import { getTripDetail } from './api/api';
import { ItemTable } from './ItemTable';

interface TripDetailProps {
  userEmail: string;
}

export function TripDetail({ userEmail }: TripDetailProps) {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<TripDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Extracted so both the mount effect and ItemTable's onRefresh (409-conflict
  // recovery) share one implementation of the trip-detail fetch.
  const fetchTrip = useCallback(() => {
    if (!tripId) return;

    setLoading(true);
    setError(null);

    return getTripDetail(tripId)
      .then((data) => setTrip(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Trip not found.');
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  if (!tripId) {
    return (
      <>
        <p>Trip not found.</p>
        <Link to="/">Back to my trips</Link>
      </>
    );
  }

  if (loading) {
    return <p>Loading trip…</p>;
  }

  if (error) {
    return (
      <>
        <p>Trip not found.</p>
        <Link to="/">Back to my trips</Link>
      </>
    );
  }

  if (!trip) {
    return null;
  }

  return (
    <>
      <h2>{trip.tripName}</h2>
      <ItemTable
        tripId={tripId}
        userEmail={userEmail}
        items={trip.items}
        participants={trip.participants}
        onItemsChange={(items) =>
          setTrip((prev) => (prev ? { ...prev, items } : prev))
        }
        onRefresh={() => {
          fetchTrip();
        }}
      />
    </>
  );
}
