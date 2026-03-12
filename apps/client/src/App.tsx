import { Authenticator } from '@aws-amplify/ui-react';
import './App.css';
import StatusChecker from './StatusChecker';
import Comments from './Comments';
import ApiConnectionStatus from './ApiConnectionStatus';
import { Header } from './Header';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <>
          <Header />
          <div>
            <img src="/pixie.png" alt="PackPixie logo" className="app-logo" />
            <ApiConnectionStatus />
          </div>
          <h1>PackPixie</h1>
          <p className="signed-in-label">
            Signed in as {user?.signInDetails?.loginId}
          </p>
          <button onClick={signOut} className="sign-out-btn">
            Sign out
          </button>
          <StatusChecker />
          <Comments />
        </>
      )}
    </Authenticator>
  );
}

export default App;
