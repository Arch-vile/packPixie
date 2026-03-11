import './App.css';
import StatusChecker from './StatusChecker';
import Comments from './Comments';

function App() {
  return (
    <>
      <img src="/pixie.png" alt="PackPixie logo" className="app-logo" />
      <h1>PackPixie</h1>
      <StatusChecker />
      <Comments />
    </>
  );
}

export default App;
