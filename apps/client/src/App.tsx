import { useEffect, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import type { Trip } from '@packpixie/model';
import './App.css';
import StatusChecker from './StatusChecker';
import Comments from './Comments';
import ApiConnectionStatus from './ApiConnectionStatus';
import { Header } from './Header';
import { TripList } from './TripList';
import { getTrips } from './api/api';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <AppContent
          userEmail={user?.signInDetails?.loginId ?? ''}
          onSignOut={signOut ?? (() => {})}
        />
      )}
    </Authenticator>
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
    <>
      <Header />
      <div>
        <img src="/pixie.png" alt="PackPixie logo" className="app-logo" />
        <ApiConnectionStatus />
      </div>
      <h1>PackPixie</h1>
      <p className="signed-in-label">Signed in as {userEmail}</p>
      <button onClick={onSignOut} className="sign-out-btn">
        Sign out
      </button>
      <TripList userEmail={userEmail} trips={trips} onTripsChange={setTrips} />
      <StatusChecker />
      <Comments />
    </>
  );
}

export default App;
