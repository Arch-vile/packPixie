import { useEffect, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import type { Trip } from '@packpixie/model';
import './App.css';
import StatusChecker from './StatusChecker';
import ApiConnectionStatus from './ApiConnectionStatus';
import { Header } from './Header';
import { TripList } from './TripList';
import { TripDetail } from './TripDetail';
import { getTrips } from './api/api';

function App() {
  return (
    <BrowserRouter>
      <Authenticator>
        {({ signOut, user }) => (
          <AppContent
            userEmail={user?.signInDetails?.loginId ?? ''}
            onSignOut={signOut ?? (() => {})}
          />
        )}
      </Authenticator>
    </BrowserRouter>
  );
}

interface AppContentProps {
  userEmail: string;
  onSignOut: () => void;
}

function AppContent({ userEmail, onSignOut }: AppContentProps) {
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    if (!userEmail) return;
    getTrips()
      .then(({ trips }) => setTrips(trips))
      .catch(() => {});
  }, [userEmail]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            <Header />
            <div>
              <img src="/pixie.png" alt="PackPixie logo" className="app-logo" />
              <ApiConnectionStatus />
            </div>
            <h1>PackPixie</h1>
            <p className="signed-in-label" data-testid="signed-in-label">Signed in as {userEmail}</p>
            <button onClick={onSignOut} className="sign-out-btn">
              Sign out
            </button>
            <TripList userEmail={userEmail} trips={trips} onTripsChange={setTrips} />
            <StatusChecker />
          </>
        }
      />
      <Route path="/trips/:tripId" element={<TripDetail userEmail={userEmail} />} />
    </Routes>
  );
}

export default App;
