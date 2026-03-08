/**
 * Response model for the API status endpoint
 */
export interface StatusResponse {
  status: string;
  version: string;
  timestamp: string;
  database: DBStatus;
}

export type DBStatus = {
  status: 'connected' | 'disconnected' | 'error';
  message: string;
};
