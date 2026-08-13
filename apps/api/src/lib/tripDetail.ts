import { Item, ItemStatus } from '@packpixie/model';

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
