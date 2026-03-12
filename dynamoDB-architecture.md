## 1. Table Setup

We will use a single table with a generic primary key structure and just one Global Secondary Index (GSI) to handle the cross-reference of users to trips.

- **Table Name:** `PackPixie`
- **Partition Key (PK):** `String`
- **Sort Key (SK):** `String`
- **GSI1 Partition Key (GSI1PK):** `String`
- **GSI1 Sort Key (GSI1SK):** `String`

---

## 2. Entity Layout

The table will hold three types of entities, all grouped together under a single Trip's Partition Key.

| Entity Type     | PK              | SK              | GSI1PK          | GSI1SK          | App Attributes                                                                               |
| --------------- | --------------- | --------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------- |
| **Trip (Meta)** | `TRIP#<TripId>` | `META#<TripId>` |                 |                 | `TripName`, `CreatedAt`                                                                      |
| **Participant** | `TRIP#<TripId>` | `USER#<UserId>` | `USER#<UserId>` | `TRIP#<TripId>` | `TripName` (denormalized), `AddedAt`                                                         |
| **Item**        | `TRIP#<TripId>` | `ITEM#<ItemId>` |                 |                 | `Name`, `Qty`, `Weight`, `PackedBy`, `UsedBy`, `Carried`, `Status`, `Consumable`, `Category` |

---

## 3. Data Types for the "Item" Attributes

Mapping your specific product rules to DynamoDB data types is where the magic happens:

- **`PackedBy` (String or Null):** Stores the `<UserId>`. If unassigned, omit the attribute or store as `null`.
- **`UsedBy` (String Set - `SS`):** DynamoDB natively supports String Sets, which guarantee uniqueness (no duplicate users). This perfectly maps to your rule: _"UsedBy is a set of trip participants, with no duplicates."_
- **`Carried` (Map - `M`):** Store this as a Map of `<UserId>` to `Number` (quantity).
- _Example:_ `{"user_123": 2, "user_456": 1}`
- This makes it trivial for the UI client to parse the map, sum the values, and compare against the total `Qty` to find the unassigned remainder for the Distribution view.

- **`Consumable` (Boolean):** `true` or `false`.
- **`Status` (String):** `"to-buy"`, `"found"`, `"packed"`, or omitted if unassigned.
- **`Category` (String):** e.g., `"Food"`, `"Gear"`.

---

## 4. Fulfilling the Access Patterns

Because the client is doing the heavy lifting, your backend only needs to execute three primary database operations.

### A. Load the Entire Trip Workspace (The "Everyday" Operation)

- **Operation:** `Query`
- **Key Condition:** `PK = TRIP#<TripId>`
- **Why it's perfect:** This single, lightning-fast query returns the Trip Metadata, the list of Participants, and _all_ Items in one go.
- **The Client Handoff:** Your backend sends this flat array to the frontend. The frontend (e.g., using React Context or Vue state) separates the items, immediately applies the `PackedBy = <CurrentUser>` filter for the default view, and allows the user to instantly toggle `Status` or `UsedBy` filters without ever hitting the database again.

### B. Get All Trips for a User (The Dashboard)

- **Operation:** `Query` on `GSI1`
- **Key Condition:** `GSI1PK = USER#<UserId>`
- **Why it's perfect:** This queries the inverted index on the Participant entity. It instantly returns a list of all trips the user is a part of. Because we denormalized `TripName` onto the Participant record, you don't even need to do a secondary lookup to render the dashboard list.

### C. The "Copy Trip" Flow

- **Operation 1 (Read):** `Query` `PK = TRIP#<OldTripId>` to get the previous trip's state.
- **Operation 2 (Process):** In your backend code, loop through the items and apply the rules:
- Delete the `Status` attribute.
- Clear the `Carried` map (set to `{}`).
- Apply the fallback rules for `PackedBy` and `UsedBy` if participants changed.

- **Operation 3 (Write):** Use `BatchWriteItem` (chunked into groups of 25, per DynamoDB limits) to write the modified Item entities, the new Participant entities, and the new Trip Meta entity under `PK = TRIP#<NewTripId>`.

---

## 5. Handling Updates

When a user interacts with the UI (e.g., checking off an item as "packed", or updating a distribution slider), the UI state updates instantly. In the background, your client sends a mutation to the backend:

- **Operation:** `UpdateItem`
- **Key:** `PK = TRIP#<TripId>`, `SK = ITEM#<ItemId>`
- **UpdateExpression Examples:**
- Status update: `SET #status = :status`
- Carry adjustment: `SET Carried.#userId = :qty`
