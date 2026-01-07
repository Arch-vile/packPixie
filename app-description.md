# Pack pixie

## 1. One-sentence definition

> A free, highly customizable web app where hiking groups create shared trips, define their own packing table structure, and collaboratively track who brings what, how their personal packing is progressing, and how shared gear weight is distributed between participants.

---

## 2. Core concepts

### 2.1 Users & auth

- Sign in with **Google only**.
- Each user can belong to multiple **trips**.

### 2.2 Trips

- Each **trip** has:

  - A **name** (e.g. “Lapland Autumn Hike 2026”).
  - A set of **participants** (users who joined via invite link).
  - A **packing table schema** (columns).
  - A set of **rows** (items).
  - Trip-specific **filters**.
  - Trip-specific **metrics** (for the Summary page).

- New trip:

  - Starts as a **clean slate**: only the “Item name” column exists.

- Trips can be **copied**:

  - Copy = full clone of: rows, columns, roles, participants, filters, metrics, values (no resets).

### 2.3 Columns (trip-specific schema)

- Each trip defines its own **columns** via the table header.
- Columns have:

  - **Name** (e.g. `Bringer`, `Weight (g)`, `Shared`, `Status`, `Category`).
  - **Type**, e.g.:

    - `text`
    - `integer`
    - `boolean`
    - `participant` (pick from trip’s participants)
    - `tag` (multi-value from a column-specific tag list)

- Example setup a group might create:

  - `Bringer` (participant)
  - `Shared` (boolean)
  - `Consumable` (boolean)
  - `Quantity` (integer)
  - `Weight (g)` (integer)
  - `Status` (tag column with tags like `to-buy`, `found`, `packed`)
  - `Category` (tag column with tags like `clothing`, `cooking`, `safety`)

#### Column roles

To enable smart features, some columns can be assigned **roles**:

- **Bringer role** → which column tells “who is bringing this item”
- **Weight role** → which integer column is “weight per unit in grams”
- **Quantity role** → which integer column is quantity
- **Shared role** → which boolean column flags shared items
- **Consumable role** → which boolean column flags consumable shared items

If roles aren’t set, related features (distribution, per-person weight, some metrics) are disabled with guidance text:
“Set Bringer and Weight roles in column settings to see this.”

### 2.4 Rows (items)

> **One row = one person bringing one specific item.**

- Every row belongs to one trip and has:

  - **Item name** (fixed column, always present).
  - Values in any **custom columns** the trip defined.

- Because multiple people can bring “the same thing”, that’s just multiple rows with the same `Item name` and different `Bringer`/`Quantity`/`Weight`/`Status`, etc.

This directly supports:

- Everyone tracking **their own packing** (rows where Bringer = them).
- Group seeing **all items** in one shared table.
- Shared items: simply rows where the column with `Shared` role is `true`.

### 2.5 Tags & status

- A **tag-type column** defines a set of allowed tags for that column.
- Users can add/remove tags per row in that column.
- Different tag columns can serve different purposes:

  - `Status` tags: `to-buy`, `found`, `packed`…
  - `Category` tags: `clothing`, `cooking`, `food`, `safety`…

- Status is **not special** in the data model – just tags.
  Groups can create whatever status workflow they like.

### 2.6 Filters

- Trips can define **named filters**.
- A filter is built from:

  - One or more **groups** of conditions.
  - Each group combines conditions with **AND**.
  - Groups are combined with **OR**.

- Conditions can target any column, depending on type:

  - `participant` → equals / not equals
  - `boolean` → is true / is false
  - `integer` → =, <, >, etc.
  - `text` → contains, equals
  - `tag` → has / doesn’t have a given tag

- Examples:

  - `My items` → `Bringer = me`
  - `Shared gear` → `Shared = true`
  - `To buy` → `Status contains to-buy`
  - Complex: `(Bringer = me AND Shared = false) OR (Shared = true AND Status contains to-buy)`

### 2.7 Metrics & Summary

On the **Summary** page, each trip can define **metrics**:

Each metric has:

- **Name** (e.g. “Weight by person and category”).
- **Group by**: one or more columns (e.g. `Bringer`, `Category`).
- **Optional filter**: a filter expression (reusing the same AND/OR logic).
- **Aggregation**:

  - `sum` or `count`
  - On a chosen numeric column for `sum` (e.g. Weight).

Examples:

- `Per-person total weight`:

  - Group by: `Bringer`
  - Aggregate: `sum(Weight)` (and optionally multiply by Quantity if role configured)

- `Count of to-buy items per person`:

  - Filter: `Status contains to-buy`
  - Group by: `Bringer`
  - Aggregate: `count(rows)`

If required roles aren’t set (e.g. no Weight role), metrics that depend on them are hidden or marked as incomplete.

### 2.8 Distribution

The **Distribution** page handles **shared gear weight distribution**.

- It only looks at rows where the column with **Shared role** is `true`.
- If there’s a **Consumable role**, shared items are split into:

  - Consumable shared items (e.g. food, gas).
  - Non-consumable shared items (e.g. tent, stove).

- For each group (consumable / non-consumable), the app can:

  - Run a **“Suggest distribution”** algorithm balancing total weight between participants.
  - Let users **manually adjust** who carries what shared item.
  - Allow **re-running** the suggestion from scratch.

You decided:

- Distribution assignments **live only on the Distribution page**.
- They **do not overwrite** the Bringer column in the main packing list.
- Packing list shows who brings the item; Distribution page shows who carries the shared items.

---

## 3. Pages & navigation

### 3.1 Global navigation

- After login:

  - User is sent directly to their **most recently opened trip**.

- From any trip:

  - “**Back to trips**” → trip list page.

### 3.2 Trip list page

- Shows all trips the user is a member of.
- Actions:

  - Open trip.
  - Create new trip (blank).
  - Copy existing trip (full clone).

### 3.3 Inside a trip – tabs

At the top of a trip:

- **Packing | Distribution | Summary** (tab bar).

#### Packing tab

- Main table showing **all rows** (items) with defined columns.
- UI:

  - Add/remove rows.
  - Inline editing of cell values.
  - Column header menus:

    - Add new column.
    - Rename column.
    - Change type.
    - Assign/remove column **role**.
    - Delete column.

- Filters:

  - Build filters via AND/OR logic.
  - Save filters with names.
  - Select a named filter from a dropdown to change what’s visible.

- Everyone sees **everyone’s items** (no private rows).
- This tab is where:

  - Users track their personal packing progress (`Status` tags etc.).
  - Group sees coverage of items.

#### Distribution tab

- Requires at least:

  - A column with **Shared role**.
  - Columns with **Bringer** and **Weight** roles for meaningful results.

- Shows only rows where Shared = true.
- If **Consumable role** exists:

  - Two sections: consumable shared items & non-consumable shared items.

- User can:

  - Run **“Suggest distribution”** to auto-balance shared weights per person (for each group).
  - Manually tweak assignments.
  - Re-run suggestion anytime.

- Distribution data is kept separate from the main table values.

#### Summary tab

- Shows **metrics** defined for this trip.
- Each metric rendered as a table (e.g. per-person summary).
- Metrics can:

  - Group by one or more columns.
  - Optionally apply a filter.
  - Use `sum` or `count` over numeric columns.

- Key use: per-person total weight, shared vs personal splits, counts of to-buy items, etc.

---

## 4. Key MVP use cases

1. **Plan a trip**

   - Create new trip (blank).
   - Add columns: `Bringer`, `Shared`, `Quantity`, `Weight`, `Status`, `Category`.
   - Assign roles (Bringer, Weight, Shared, etc.).
   - Add rows for items; each participant adds their own items.

2. **Track my packing**

   - Join trip via share link and sign in with Google.
   - Use a filter like `Bringer = me` or saved `My items` filter.
   - Tag rows with `Status` tags (`to-buy`, `packed`, etc.).
   - Watch Summary metrics like “My total weight” (if configured).

3. **Coordinate shared gear**

   - Mark items that are group gear with `Shared = true`.
   - Filter `Shared = true` on Packing tab to review coverage.
   - Go to Distribution tab to see how shared weight is spread.

4. **Balance shared weight**

   - On Distribution tab, run “Suggest distribution”.
   - Review per-person loads for shared items.
   - Adjust assignment manually if needed.
   - Re-run suggestion if items/weights change.

5. **Custom views & metrics**

   - Create named filters (e.g. `Food`, `To buy`, `Shared gear`).
   - Define metrics on Summary (e.g. weight by person, count of to-buy items).
   - Use metrics to quickly inspect where the group stands.

---

From my side, this now feels like a **full high-level description** of the application and its core behavior.

Is there anything **big and conceptual** you feel is still missing (e.g. some permission idea, special hiking-specific feature, or something about how groups reuse setups between trips)?
