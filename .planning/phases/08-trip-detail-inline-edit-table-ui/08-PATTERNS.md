# Phase 8: Trip-Detail Inline-Edit Table (UI) - Pattern Map

**Mapped:** 2026-09-06
**Files analyzed:** 6 (2 modified, 4 new)
**Analogs found:** 6 / 6 (all resolve to same small set of existing client files — this is a young codebase with one established style, not a gap)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/client/src/api/api.ts` (modify: add `getTripDetail`, `createItem`, `patchItem`, `deleteItem`) | service (API client) | request-response | itself (`getTrips`/`createTrip`, lines 28-51) | exact |
| `apps/client/src/App.tsx` (modify: add `<BrowserRouter>`/`<Routes>`/`<Route>`) | provider / router config | request-response (route dispatch, no data flow of its own) | itself (`App`/`AppContent`, lines 1-57) | exact |
| `apps/client/src/TripList.tsx` (modify: wrap each `<li>` in `<Link>`) | component | CRUD (list read, no new write) | itself (lines 154-171, the `<ul>`/`<li>` render block) | exact |
| `apps/client/src/TripDetail.tsx` (new) | component (page-level) | request-response (fetch-on-mount + 404 branch) | `apps/client/src/App.tsx`'s `AppContent` (`useEffect`+`getTrips` fetch pattern, lines 30-37) | role-match (closest existing "page fetches on mount" shape) |
| `apps/client/src/ItemTable.tsx` (new) | component (presentational + mutating) | CRUD (add/edit/delete against Phase 7 endpoints) | `apps/client/src/TripList.tsx` (list-render + inline create-form pattern, lines 70-174) | role-match (closest existing "list + inline form + error state" shape) |
| `packages/model/src/item.ts` | model (no changes needed) | — | already shipped (Phase 5/6/7) | n/a — reference only, not modified this phase |

## Pattern Assignments

### `apps/client/src/api/api.ts` (service, request-response) — ADD 4 functions

**Analog:** itself, `getTrips`/`createTrip` (same file, lines 1-51)

**Imports pattern** (lines 1-7 — extend the type-only import list, add `Item`/`TripDetailResponse`/`CreateItemRequest`/`PatchItemRequest`):
```typescript
import type {
  StatusResponse,
  CreateTripResponse,
  GetTripsResponse,
  TripDetailResponse,
  Item,
  CreateItemRequest,
  PatchItemRequest,
} from '@packpixie/model';
import { fetchAuthSession } from 'aws-amplify/auth';
import config from '../config';
```

**Auth pattern** (lines 9-18, reused verbatim — every new function calls this first):
```typescript
async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('Not authenticated');
  }
  return {
    Authorization: `Bearer ${idToken}`,
  };
}
```

**Core GET pattern to copy for `getTripDetail`** (lines 28-35, `getTrips`):
```typescript
export async function getTrips(): Promise<GetTripsResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips`, { headers });
  if (!response.ok) {
    throw new Error('Failed to load trips');
  }
  return response.json();
}
```
New function needs an extra 404 branch before the generic `!response.ok` check (per RESEARCH.md Code Examples — verbatim string `'Trip not found.'` matches the UI-SPEC copy contract):
```typescript
export async function getTripDetail(tripId: string): Promise<TripDetailResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips/${tripId}`, { headers });
  if (response.status === 404) {
    throw new Error('Trip not found.');
  }
  if (!response.ok) {
    throw new Error('Failed to load trip.');
  }
  return response.json();
}
```

**Core POST pattern to copy for `createItem`** (lines 37-51, `createTrip` — body-serializing POST with `Content-Type` header):
```typescript
export async function createTrip(
  tripName: string,
  participantEmails: string[],
): Promise<CreateTripResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${config.apiUrl}/api/trips`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripName, participantEmails }),
  });
  if (!response.ok) {
    throw new Error('Failed to create trip');
  }
  return response.json();
}
```
`createItem(tripId, body: CreateItemRequest): Promise<Item>` and `patchItem(tripId, itemId, patch: PatchItemRequest): Promise<Item>` follow this exact shape, POST/PATCH respectively to `` `${config.apiUrl}/api/trips/${tripId}/items` `` and `` `${config.apiUrl}/api/trips/${tripId}/items/${itemId}` ``. `patchItem` needs an extra 409 branch (see Shared Patterns → Conflict Handling below) before the generic error throw. `deleteItem(tripId, itemId): Promise<void>` follows the same shape with `method: 'DELETE'`, no body, and returns nothing (`response.ok` check only — no `.json()` call, matching the DELETE handler's 200-with-no-body contract per `apps/api/src/routes/api.ts` ~L478).

---

### `apps/client/src/App.tsx` (router config) — MODIFY

**Analog:** itself (current lines 1-57)

**Current structure to modify:**
```typescript
function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <AppContent
          userEmail={user?.signInDetails?.loginId ?? ''}
          onSignOut={signOut ?? (() => {})}
        />
      )}
    </Authenticator>
  );
}
```
Per RESEARCH.md Pattern 1/Open Question 2: wrap `<Authenticator>` in `<BrowserRouter>` inside `App`, and replace `AppContent`'s current flat JSX return (lines 39-55, which inlines the trip-list body directly) with `<Routes><Route path="/" element={...trip-list body.../><Route path="/trips/:tripId" element={<TripDetail userEmail={userEmail} />} /></Routes>`. The existing `useEffect`+`getTrips` fetch block (lines 30-37) stays as-is inside whatever component renders at `/` — either `AppContent` keeps it (rendering it directly on the `/` route) or it's extracted into a small `TripListPage` wrapper; either satisfies the one-component-per-file convention loosely since `AppContent` already isn't its own file.

**Imports to add:**
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TripDetail } from './TripDetail';
```

---

### `apps/client/src/TripList.tsx` (component, CRUD) — MODIFY (add navigation only)

**Analog:** itself, the render block (lines 154-171)

**Current block to modify:**
```tsx
<ul className="trip-items">
  {trips.map((trip) => (
    <li key={trip.tripId} className="trip-item">
      <div className="trip-item-main">
        <span className="trip-name" data-testid="trip-name">{trip.tripName}</span>
        <span className="trip-date">
          {new Date(trip.createdAt).toLocaleDateString()}
        </span>
      </div>
      {trip.participants.length > 0 && (
        <div className="trip-participants">
          {trip.participants.join(', ')}
        </div>
      )}
    </li>
  ))}
</ul>
```
Per RESEARCH.md Pattern 3: wrap the `<li>`'s children in `<Link to={`/trips/${trip.tripId}`}>` (keep `className="trip-item"` on the `<li>`, put `<Link>` as the sole child spanning the inner content — preserves the existing CSS target without duplicating the class onto both `<li>` and `<a>`). Add `import { Link } from 'react-router-dom';` to the top import block (after the `useState` import, before local imports, matching this file's existing external→internal import ordering).

---

### `apps/client/src/TripDetail.tsx` (page component, request-response) — NEW

**Analog:** `apps/client/src/App.tsx`'s `AppContent` fetch-on-mount shape (lines 24-37)

**Fetch-on-mount + error-state pattern to copy:**
```typescript
// AppContent's existing shape (App.tsx lines 30-37) — copy this useEffect structure,
// but per CONVENTIONS.md's error-handling pattern (useState<string|null>, not swallowed silently):
const [trip, setTrip] = useState<TripDetailResponse | null>(null);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  if (!tripId) return;
  getTripDetail(tripId)
    .then(setTrip)
    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load trip.'));
}, [tripId]);
```
`useParams<{ tripId: string }>()` per RESEARCH.md Pattern 2 supplies `tripId`. On `error` (any fetch failure, since server already collapses 404-vs-403 per Phase 6 D-02 — never branch UI on which case occurred), render the identical "Trip not found." message + `<Link to="/">Back to my trips</Link>` regardless of cause, per CONTEXT.md's discretion note and RESEARCH.md's Security Domain V4 guidance (client must preserve, not re-derive, the server's indistinguishable-404 contract).

**Props interface placement** (per CONVENTIONS.md — declared immediately above the component, matching `TripListProps` in `TripList.tsx` lines 5-9):
```typescript
interface TripDetailProps {
  userEmail: string;
}

export function TripDetail({ userEmail }: TripDetailProps) { ... }
```

---

### `apps/client/src/ItemTable.tsx` (component, CRUD) — NEW

**Analog:** `apps/client/src/TripList.tsx` (list-render + inline form + error state, whole file)

**Error-state + async-handler pattern to copy** (from `TripList.tsx`'s `handleCreate`, lines 39-60 — reset-try-catch-finally shape, per CONVENTIONS.md's documented client error pattern):
```typescript
const [error, setError] = useState<string | null>(null);
// ... inside a handler:
setError(null);
try {
  const updated = await patchItem(tripId, itemId, { [field]: value });
  // reconcile only the field(s) this request owns — RESEARCH.md Pitfall 2
} catch (err) {
  // roll back optimistic value; branch on ConflictError vs generic Error — see Shared Patterns below
}
```

**Add-row pattern** (per RESEARCH.md Pattern 4 — immediate `POST`, not an optimistic client-stub; distinct from every other row's edit-flow):
```typescript
async function handleAddItem() {
  const created = await createItem(tripId, {
    name: '',
    packedBy: userEmail,
    // status omitted → unset
  });
  setItems((prev) => [...prev, created]); // created.itemId is server-issued
}
```

**List-render structural pattern to copy** (`TripList.tsx` lines 151-171 — `.length === 0` empty-state branch, `.map()` with `key`):
```tsx
{items.length === 0 ? (
  <p className="empty-state">No items yet. Add one to get started!</p>
) : (
  <table>
    <tbody>
      {items.map((item) => (
        <tr key={item.itemId}>{/* per-field inputs, D-01/D-02/D-05-D-08 */}</tr>
      ))}
    </tbody>
  </table>
)}
```

---

## Shared Patterns

### Client Error State (all new/modified components)
**Source:** `apps/client/src/TripList.tsx` lines 17, 44-59 (declared pattern in `.planning/codebase/CONVENTIONS.md`)
**Apply to:** `TripDetail.tsx` (fetch error), `ItemTable.tsx` (every mutation handler)
```typescript
const [error, setError] = useState<string | null>(null);
// at the start of each async operation: setError(null)
// on failure: setError('<user-facing message>')
// rendered inline in JSX, e.g. {error && <p className="error-message">{error}</p>}
```
No toast/notification library exists or should be introduced — inline JSX rendering only.

### Auth Header Injection (all new API functions)
**Source:** `apps/client/src/api/api.ts` lines 9-18 (`getAuthHeaders`)
**Apply to:** `getTripDetail`, `createItem`, `patchItem`, `deleteItem` — every one calls `getAuthHeaders()` first, spreads it into `fetch`'s `headers`, and (for POST/PATCH) adds `'Content-Type': 'application/json'` alongside it.

### Conflict Handling (409) — NEW pattern this phase introduces, no prior analog
**Source:** RESEARCH.md Code Examples → "Field patch with per-field reconciliation" + Common Pitfall 3
**Apply to:** `patchItem` in `api/api.ts` (throw path) and `ItemTable.tsx` (catch path)
```typescript
// api.ts: patchItem must special-case 409 before the generic !response.ok branch
if (response.status === 409) {
  const body = await response.json();
  throw new ConflictError(body.error); // 'Item was modified concurrently — refresh and retry'
}
```
A small `ConflictError extends Error` class (new, colocated in `api.ts` or a shared errors module) lets `ItemTable.tsx` distinguish "roll back field + show verbatim server message + Refresh button (re-fetch `getTripDetail`)" from the generic "roll back field + show 'Failed to save changes.'" branch. Never auto-retry on 409.

### Verb-Prefixed API Client Functions (naming convention, all new functions)
**Source:** `.planning/codebase/CONVENTIONS.md` — "API client functions: verb prefix matching HTTP semantics (`getTrips`, `postComment`, `createTrip`)"
**Apply to:** `getTripDetail` (GET), `createItem` (POST), `patchItem` (PATCH), `deleteItem` (DELETE) — names already chosen to match this convention; components call these, never raw `fetch()`.

### Props Interface Placement (naming convention, all new components)
**Source:** `.planning/codebase/CONVENTIONS.md` + `apps/client/src/TripList.tsx` lines 5-9
**Apply to:** `TripDetail.tsx`, `ItemTable.tsx` — Props interface (`TripDetailProps`, `ItemTableProps`) declared immediately above the consuming component; named export for both (reusable components per convention — neither is the app's top-level default export, which stays `App`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `<BrowserRouter>`/`<Routes>`/`<Route>` setup in `App.tsx` | provider/router config | — | No routing exists anywhere in the codebase today (RESEARCH.md: "first phase to introduce client-side routing"). Use RESEARCH.md's Pattern 1/2/3 code examples directly — they are the analog here, not an existing file. |
| Optimistic per-field auto-save + rollback in `ItemTable.tsx` | component (mutating, CRUD) | No prior optimistic-update code exists in `apps/client` (`TripList.tsx`'s create flow is fire-and-refetch, not optimistic). Use RESEARCH.md's Common Pitfalls 2-3 and Code Examples section directly. |

## Metadata

**Analog search scope:** `apps/client/src/` (all 13 files), `apps/client/src/api/api.ts`, `packages/model/src/item.ts`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md`
**Files scanned:** 13 client source files + 1 model file + 2 convention docs
**Pattern extraction date:** 2026-09-06
