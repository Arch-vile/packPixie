import { useState } from 'react';
import type { StatusResponse } from '@packpixie/model';

export default function StatusChecker() {
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3000/api/status');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: StatusResponse = await response.json();
      setStatusData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        margin: '20px',
        padding: '20px',
        border: '1px solid #ccc',
        borderRadius: '8px',
      }}
    >
      <h2>API Status Checker</h2>

      <button
        onClick={checkStatus}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Checking...' : 'Check API Status'}
      </button>

      {error && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '4px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {statusData && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#d4edda',
            color: '#155724',
            borderRadius: '4px',
          }}
        >
          <h3>API Response:</h3>
          <p>
            <strong>Status:</strong> {statusData.status}
          </p>
          <p>
            <strong>Version:</strong> {statusData.version}
          </p>
          <p>
            <strong>Timestamp:</strong> {statusData.timestamp}
          </p>
        </div>
      )}
    </div>
  );
}
