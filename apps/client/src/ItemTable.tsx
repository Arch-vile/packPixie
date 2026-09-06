import { useEffect, useRef, useState } from 'react';
import type { Item, ItemStatus, PatchItemRequest } from '@packpixie/model';
import { ConflictError, createItem, deleteItem, patchItem } from './api/api';

interface ItemTableProps {
  tripId: string;
  userEmail: string;
  items: Item[];
  participants: string[];
  onItemsChange: (items: Item[]) => void;
  onRefresh: () => void;
}

interface RowError {
  message: string;
  conflict: boolean;
}

const STATUS_OPTIONS: { value: ItemStatus | ''; label: string }[] = [
  { value: '', label: '(unset)' },
  { value: 'to-buy', label: 'to-buy' },
  { value: 'found', label: 'found' },
  { value: 'packed', label: 'packed' },
];

// Reads a single field off an Item using a PatchItemRequest field key. Bridges
// through `unknown` since Item and PatchItemRequest have structurally
// overlapping but not identical (optional vs. nullable) field types.
function getFieldValue(item: Item, field: keyof PatchItemRequest): unknown {
  return (item as unknown as Record<string, unknown>)[field];
}

export function ItemTable({
  tripId,
  userEmail,
  items,
  participants,
  onItemsChange,
  onRefresh,
}: ItemTableProps) {
  // itemsRef always mirrors the latest `items` prop so async handlers (patch
  // responses that resolve after further edits) never compute their merge off
  // a stale render's closure (RESEARCH.md Pitfall 2).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [rowErrors, setRowErrors] = useState<Record<string, RowError | null>>({});
  const [invalidNames, setInvalidNames] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function setRowError(itemId: string, error: RowError | null) {
    setRowErrors((prev) => ({ ...prev, [itemId]: error }));
  }

  function setNameInvalid(itemId: string, invalid: boolean) {
    setInvalidNames((prev) => ({ ...prev, [itemId]: invalid }));
  }

  // Applies a single-field update to local state and keeps itemsRef in sync
  // immediately (not waiting for the next render), so a second field update
  // fired before this one's parent re-render sees the first one's change too.
  function applyFieldUpdate(
    itemId: string,
    field: keyof PatchItemRequest,
    value: unknown,
  ) {
    const updated = itemsRef.current.map((i) =>
      i.itemId === itemId ? { ...i, [field]: value } : i,
    ) as unknown as Item[];
    itemsRef.current = updated;
    onItemsChange(updated);
  }

  async function handleFieldChange(
    itemId: string,
    field: keyof PatchItemRequest,
    value: unknown,
  ) {
    const item = itemsRef.current.find((i) => i.itemId === itemId);
    if (!item) return;
    const previousValue = getFieldValue(item, field);

    // 1. Optimistic update (D-03).
    applyFieldUpdate(itemId, field, value);
    setRowError(itemId, null);

    try {
      const patch = { [field]: value } as unknown as PatchItemRequest;
      const updated = await patchItem(tripId, itemId, patch);
      // 3. Reconcile ONLY the field this request owns — never the whole row
      // (RESEARCH.md Pitfall 2: a slower response for another field must not
      // stomp a newer optimistic value).
      applyFieldUpdate(itemId, field, getFieldValue(updated, field));
    } catch (err) {
      // 4. Roll back to the last known-good SERVER value.
      applyFieldUpdate(itemId, field, previousValue);
      if (err instanceof ConflictError) {
        setRowError(itemId, { message: err.message, conflict: true });
      } else {
        setRowError(itemId, {
          message: 'Failed to save changes. Please try again.',
          conflict: false,
        });
      }
    }
  }

  function handleRefreshRow(itemId: string) {
    setRowError(itemId, null);
    onRefresh();
  }

  async function handleDeleteItem(item: Item) {
    const confirmed = window.confirm(
      `Delete "${item.name}"? This can't be undone.`,
    );
    if (!confirmed) return;

    try {
      // deleteItem resolves normally for both a genuine successful delete and
      // a 404 (item already gone — another participant's delete, or a rapid
      // double-click sent two requests). Both are idempotent no-ops from the
      // UI's perspective: the row simply disappears, never a spurious error
      // (ITEM-03/idempotency).
      await deleteItem(tripId, item.itemId);
      const updated = itemsRef.current.filter((i) => i.itemId !== item.itemId);
      itemsRef.current = updated;
      onItemsChange(updated);
      setRowError(item.itemId, null);
    } catch {
      setRowError(item.itemId, {
        message: 'Failed to save changes. Please try again.',
        conflict: false,
      });
    }
  }

  async function handleAddItem() {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await createItem(tripId, {
        name: '',
        packedBy: userEmail,
        // status omitted so it defaults unset (ITEM-01)
      });
      const updated = [...itemsRef.current, created];
      itemsRef.current = updated;
      onItemsChange(updated);
    } catch {
      setAddError('Failed to save changes. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="item-table-container">
      {items.length === 0 ? (
        <p className="empty-state">No items yet. Add one to get started!</p>
      ) : (
        <table className="item-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Quantity</th>
              <th>Weight</th>
              <th>PackedBy</th>
              <th>Status</th>
              <th>Category</th>
              <th>Consumable</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.itemId}
                item={item}
                participants={participants}
                rowError={rowErrors[item.itemId] ?? null}
                invalidName={invalidNames[item.itemId] ?? false}
                onFieldChange={handleFieldChange}
                onNameValidityChange={setNameInvalid}
                onRefreshRow={handleRefreshRow}
                onDelete={handleDeleteItem}
              />
            ))}
          </tbody>
        </table>
      )}

      <div className="item-table-actions">
        <button className="btn-primary" onClick={handleAddItem} disabled={adding}>
          + Add item
        </button>
        {addError && <p className="error-message">{addError}</p>}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: Item;
  participants: string[];
  rowError: RowError | null;
  invalidName: boolean;
  onFieldChange: (
    itemId: string,
    field: keyof PatchItemRequest,
    value: unknown,
  ) => void;
  onNameValidityChange: (itemId: string, invalid: boolean) => void;
  onRefreshRow: (itemId: string) => void;
  onDelete: (item: Item) => void;
}

function ItemRow({
  item,
  participants,
  rowError,
  invalidName,
  onFieldChange,
  onNameValidityChange,
  onRefreshRow,
  onDelete,
}: ItemRowProps) {
  // Local "draft" state for text/number fields decouples what's on-screen
  // while typing from the committed `item` value (which only updates once a
  // blur/change save round-trips) — re-synced from the item prop whenever it
  // changes (server reconciliation, rollback, or an external refresh).
  const [nameDraft, setNameDraft] = useState(item.name);
  const [quantityDraft, setQuantityDraft] = useState(String(item.quantity));
  const [weightDraft, setWeightDraft] = useState(
    item.weight === undefined ? '' : String(item.weight),
  );
  const [categoryDraft, setCategoryDraft] = useState(item.category ?? '');

  useEffect(() => {
    setNameDraft(item.name);
  }, [item.name]);
  useEffect(() => {
    setQuantityDraft(String(item.quantity));
  }, [item.quantity]);
  useEffect(() => {
    setWeightDraft(item.weight === undefined ? '' : String(item.weight));
  }, [item.weight]);
  useEffect(() => {
    setCategoryDraft(item.category ?? '');
  }, [item.category]);

  function handleNameBlur() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      // D-07: client-only blank-name guard — flag visually, skip the PATCH
      // entirely. The write API itself does not reject an empty name.
      onNameValidityChange(item.itemId, true);
      return;
    }
    onNameValidityChange(item.itemId, false);
    onFieldChange(item.itemId, 'name', trimmed);
  }

  function handleQuantityBlur() {
    const parsed = Number(quantityDraft);
    onFieldChange(item.itemId, 'quantity', Number.isFinite(parsed) ? parsed : 0);
  }

  function handleWeightBlur() {
    const trimmed = weightDraft.trim();
    if (trimmed === '') {
      // D-06: an emptied Weight input clears the field (null), distinct from
      // a typed 0.
      onFieldChange(item.itemId, 'weight', null);
      return;
    }
    const parsed = Number(trimmed);
    onFieldChange(item.itemId, 'weight', Number.isFinite(parsed) ? parsed : null);
  }

  function handleCategoryBlur() {
    onFieldChange(item.itemId, 'category', categoryDraft);
  }

  function handlePackedByChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onFieldChange(item.itemId, 'packedBy', value === '' ? null : value);
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    onFieldChange(item.itemId, 'status', value === '' ? null : (value as ItemStatus));
  }

  function handleConsumableChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFieldChange(item.itemId, 'consumable', e.target.checked);
  }

  return (
    <>
      <tr className="item-row">
        <td className="cell-name">
          <input
            type="text"
            className={invalidName ? 'cell-invalid' : undefined}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleNameBlur}
          />
        </td>
        <td className="cell-quantity">
          <input
            type="number"
            value={quantityDraft}
            onChange={(e) => setQuantityDraft(e.target.value)}
            onBlur={handleQuantityBlur}
          />
        </td>
        <td className="cell-weight">
          <input
            type="number"
            value={weightDraft}
            onChange={(e) => setWeightDraft(e.target.value)}
            onBlur={handleWeightBlur}
          />
        </td>
        <td className="cell-packed-by">
          <select value={item.packedBy ?? ''} onChange={handlePackedByChange}>
            <option value="">Unassigned</option>
            {participants.map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </select>
        </td>
        <td className="cell-status">
          <select value={item.status ?? ''} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </td>
        <td className="cell-category">
          <input
            type="text"
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
            onBlur={handleCategoryBlur}
          />
        </td>
        <td className="cell-consumable">
          <input
            type="checkbox"
            checked={item.consumable}
            onChange={handleConsumableChange}
          />
        </td>
        <td className="cell-delete">
          <button
            type="button"
            className="btn-destructive"
            onClick={() => onDelete(item)}
            disabled={item.status === 'packed'}
            title={
              item.status === 'packed'
                ? 'Unpack item before deleting'
                : undefined
            }
          >
            Delete
          </button>
        </td>
      </tr>
      {rowError && (
        <tr className="item-row-error">
          <td colSpan={8}>
            <p className="error-message">{rowError.message}</p>
            {rowError.conflict && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onRefreshRow(item.itemId)}
              >
                Refresh
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
