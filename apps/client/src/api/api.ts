import type { StatusResponse } from '@packpixie/model';
import config from '../config';

export async function getApiStatus() {
  const response = await fetch(`${config.apiUrl}/api/status`);
  if (response.ok) {
    const status: StatusResponse = await response.json();
    return status;
  }
}
