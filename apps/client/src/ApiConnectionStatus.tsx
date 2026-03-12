import { useEffect, useState } from 'react';
import { getApiStatus } from './api/api';
import { type StatusResponse } from '@packpixie/model';

export default function ApiConnectionStatus() {
  const [apiStatus, setApiStatus] = useState<StatusResponse | undefined>();
  useEffect(() => {
    getApiStatus().then(setApiStatus);
  }, []);

  const status = apiStatus?.version
    ? 'API version: ' + apiStatus.version
    : 'Checking API status...';

  return <span>{status}</span>;
}
