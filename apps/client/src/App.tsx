import { Authenticator } from '@aws-amplify/ui-react';
import './App.css';
import StatusChecker from './StatusChecker';
import Comments from './Comments';

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <>
          <img src="/pixie.png" alt="PackPixie logo" className="app-logo" />
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
