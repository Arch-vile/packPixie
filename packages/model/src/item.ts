export type ItemStatus = 'to-buy' | 'found' | 'packed';

export interface Item {
  itemId: string;
  createdAt: string;
  name: string;
  quantity: number;
  consumable: boolean;
  weight?: number;
  packedBy?: string;
  status?: ItemStatus;
  category?: string;
}

export interface TripDetailResponse {
  tripId: string;
  tripName: string;
  participants: string[];
  items: Item[];
}
