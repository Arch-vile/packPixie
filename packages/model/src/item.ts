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

export interface CreateItemRequest {
  name: string;
  quantity?: number;
  weight?: number;
  packedBy?: string;
  status?: ItemStatus;
  category?: string;
  consumable?: boolean;
}

export interface PatchItemRequest {
  name?: string;
  quantity?: number;
  weight?: number | null;
  packedBy?: string | null;
  status?: ItemStatus | null;
  category?: string | null;
  consumable?: boolean;
}

export interface TripDetailResponse {
  tripId: string;
  tripName: string;
  participants: string[];
  items: Item[];
}
