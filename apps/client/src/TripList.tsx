import { useState } from 'react';
import type { Trip } from '@packpixie/model';
import { createTrip, getTrips } from './api/api';

interface TripListProps {
  userEmail: string;
  trips: Trip[];
  onTripsChange: (trips: Trip[]) => void;
}

export function TripList({ userEmail, trips, onTripsChange }: TripListProps) {
  const [showForm, setShowForm] = useState(false);
  const [tripName, setTripName] = useState('');
  const [participantEmails, setParticipantEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addEmail() {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (email === userEmail.toLowerCase()) return; // creator already included
    if (participantEmails.includes(email)) return; // no duplicates
    setParticipantEmails((prev) => [...prev, email]);
    setEmailInput('');
  }

  function removeEmail(email: string) {
    setParticipantEmails((prev) => prev.filter((e) => e !== email));
  }

  function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEmail();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = tripName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);

    try {
      await createTrip(userEmail, name, participantEmails);
      const { trips: updated } = await getTrips(userEmail);
      onTripsChange(updated);
      setTripName('');
      setParticipantEmails([]);
      setEmailInput('');
      setShowForm(false);
    } catch {
      setError('Failed to create trip. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  function handleCancel() {
    setShowForm(false);
    setTripName('');
    setParticipantEmails([]);
    setEmailInput('');
    setError(null);
  }

  return (
    <div className="trip-list">
      <div className="trip-list-header">
        <h2>My Trips</h2>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New Trip
          </button>
        )}
      </div>

      {showForm && (
        <form className="create-trip-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Trip name"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            autoFocus
            disabled={creating}
            maxLength={100}
          />

          <label className="participant-label">Participants</label>
          <div className="participant-tags">
            <span className="participant-tag creator-tag">{userEmail}</span>
            {participantEmails.map((email) => (
              <span key={email} className="participant-tag">
                {email}
                <button
                  type="button"
                  className="tag-remove"
                  onClick={() => removeEmail(email)}
                  disabled={creating}
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="participant-input-row">
            <input
              type="email"
              placeholder="Add participant email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              disabled={creating}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={addEmail}
              disabled={creating || !emailInput.trim()}
            >
              Add
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={creating || !tripName.trim()}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancel}
              disabled={creating}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {trips.length === 0 ? (
        <p className="empty-state">No trips yet. Create one to get started!</p>
      ) : (
        <ul className="trip-items">
          {trips.map((trip) => (
            <li key={trip.tripId} className="trip-item">
              <div className="trip-item-main">
                <span className="trip-name">{trip.tripName}</span>
                <span className="trip-date">
                  {new Date(trip.createdAt).toLocaleDateString()}
                </span>
              </div>
              {trip.participants.length > 0 && (
                <div className="trip-participants">
                  {trip.participants.join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
