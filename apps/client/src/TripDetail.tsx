import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TripDetailResponse } from '@packpixie/model';
import { getTripDetail } from './api/api';

interface TripDetailProps {
  userEmail: string;
}

// userEmail is unused by this tracer slice; Plan 08-02's ItemTable consumes it (e.g. new-item
// PackedBy default). Kept on the props contract now so App.tsx's call site doesn't change again.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TripDetail({ userEmail: _userEmail }: TripDetailProps) {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<TripDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) return;

    setLoading(true);
    setError(null);

    getTripDetail(tripId)
      .then((data) => setTrip(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Trip not found.');
      })
      .finally(() => setLoading(false));
  }, [tripId]);

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

  return (
    <>
      <h2>{trip?.tripName}</h2>
      <ul>
        {trip?.items.map((item) => <li key={item.itemId}>{item.name}</li>)}
      </ul>
    </>
  );
}
