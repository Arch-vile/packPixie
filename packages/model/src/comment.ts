export interface TripComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface GetCommentsResponse {
  comments: TripComment[];
}
