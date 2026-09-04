import { CreateItemRequest, Item, ItemStatus } from '@packpixie/model';

// Map a stored DynamoDB item record to the public Item DTO.
//
// Cross-phase contract (D-04): the storage-attribute names read here
// (Name/Qty/Weight/PackedBy/Status/Consumable/Category/CreatedAt, SK ITEM#<id>)
// are the single source of truth the Phase 7 write path MUST match.
//
// Optional attributes are assigned only when present (conditional assignment,
// never object spread), so an absent stored attribute yields an absent DTO key
// (never null/empty/zero) and no internal key (PK/SK/GSI*) is ever copied
// (D-04/D-05).
export function mapItemRecord(r: Record<string, unknown>): Item {
  const item: Item = {
    itemId: (r.SK as string).replace('ITEM#', ''),
    createdAt: r.CreatedAt as string,
    name: r.Name as string,
    quantity: r.Qty as number,
    consumable: r.Consumable as boolean,
  };
  if (r.Weight !== undefined) item.weight = r.Weight as number;
  if (r.PackedBy !== undefined) item.packedBy = r.PackedBy as string;
  if (r.Status !== undefined) item.status = r.Status as ItemStatus;
  if (r.Category !== undefined) item.category = r.Category as string;
  return item;
}

// --- Item write-path validation core (Phase 7) ---
//
// Shared by POST/PATCH/DELETE handlers in routes/api.ts. Every mutation must
// route through these helpers rather than issuing a raw PutItem/UpdateItem
// that bypasses the packing invariants (ITEM-04/ITEM-05/ITEM-06).

export type ItemWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const ITEM_WRITABLE_FIELDS = [
  'name',
  'quantity',
  'weight',
  'packedBy',
  'status',
  'category',
  'consumable',
] as const;

export function findUnknownFields(body: object): string[] {
  return Object.keys(body).filter(
    (key) => !(ITEM_WRITABLE_FIELDS as readonly string[]).includes(key),
  );
}

export function isValidItemStatus(value: unknown): value is ItemStatus {
  return value === 'to-buy' || value === 'found' || value === 'packed';
}

export function validateStatusRequiresPackedBy(
  status: ItemStatus | undefined,
  packedBy: string | undefined,
): string | null {
  if (status === 'packed' && !packedBy?.trim()) {
    return 'packed requires PackedBy to be set';
  }
  return null;
}

export function validatePackedByParticipant(
  packedBy: string,
  participantEmails: string[],
): string | null {
  const normalized = packedBy.trim().toLowerCase();
  const normalizedParticipants = participantEmails.map((e) =>
    e.trim().toLowerCase(),
  );
  if (!normalizedParticipants.includes(normalized)) {
    return 'PackedBy must be a trip participant';
  }
  return null;
}

export function validateNumericField(
  value: unknown,
  fieldLabel: string,
): ItemWriteResult<number> {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: `${fieldLabel} must be a non-negative number`,
  };
}

export function isTripMember(
  records: Record<string, unknown>[],
  callerEmail: string,
): boolean {
  return records.some((r) => r.SK === `USER#${callerEmail}`);
}

export function extractParticipantEmails(
  records: Record<string, unknown>[],
): string[] {
  return records
    .filter((r) => (r.SK as string).startsWith('USER#'))
    .map((r) => r.Email as string)
    .filter(Boolean);
}

export function findItemRecord(
  records: Record<string, unknown>[],
  itemId: string,
): Record<string, unknown> | undefined {
  return records.find((r) => r.SK === `ITEM#${itemId}`);
}

export interface BuildCreateItemAttributesParams {
  tripId: string;
  itemId: string;
  now: string;
  body: CreateItemRequest;
  participantEmails: string[];
}

export function buildCreateItemAttributes(
  params: BuildCreateItemAttributesParams,
): ItemWriteResult<Record<string, unknown>> {
  const { tripId, itemId, now, body, participantEmails } = params;

  const trimmedName = body.name?.trim();
  if (!trimmedName) {
    return { ok: false, error: 'name is required' };
  }

  const unknownFields = findUnknownFields(body);
  if (unknownFields.length > 0) {
    return { ok: false, error: `Unknown field: ${unknownFields[0]}` };
  }

  let quantity: number;
  if (body.quantity === undefined) {
    quantity = 1;
  } else {
    const result = validateNumericField(body.quantity, 'quantity');
    if (!result.ok) return result;
    quantity = result.value;
  }

  let consumable: boolean;
  if (body.consumable === undefined) {
    consumable = false;
  } else {
    if (typeof body.consumable !== 'boolean') {
      return { ok: false, error: 'consumable must be a boolean' };
    }
    consumable = body.consumable;
  }

  let weight: number | undefined;
  if (body.weight !== undefined) {
    const result = validateNumericField(body.weight, 'weight');
    if (!result.ok) return result;
    weight = result.value;
  }

  let status: ItemStatus | undefined;
  if (body.status !== undefined) {
    if (!isValidItemStatus(body.status)) {
      return {
        ok: false,
        error: 'status must be one of to-buy, found, packed',
      };
    }
    status = body.status;
  }

  let packedBy: string | undefined;
  if (body.packedBy !== undefined) {
    const trimmed = body.packedBy.trim();
    if (!trimmed) {
      return { ok: false, error: 'packedBy must be a non-empty string' };
    }
    const participantError = validatePackedByParticipant(
      trimmed,
      participantEmails,
    );
    if (participantError) {
      return { ok: false, error: participantError };
    }
    packedBy = trimmed;
  }

  const statusError = validateStatusRequiresPackedBy(status, packedBy);
  if (statusError) {
    return { ok: false, error: statusError };
  }

  return {
    ok: true,
    value: {
      PK: `TRIP#${tripId}`,
      SK: `ITEM#${itemId}`,
      CreatedAt: now,
      Name: trimmedName,
      Qty: quantity,
      Consumable: consumable,
      ...(weight !== undefined && { Weight: weight }),
      ...(packedBy !== undefined && {
        PackedBy: packedBy.trim().toLowerCase(),
      }),
      ...(status !== undefined && { Status: status }),
      ...(body.category !== undefined && { Category: body.category }),
    },
  };
}
