# Pack pixie

## 1. One-sentence definition

> A free web app where hiking groups create shared trips and collaboratively track who brings what, how everyone’s packing is progressing, and how shared gear weight is distributed across participants — using a fixed, purpose-built packing table.

## 2. Core concepts

### 2.1 Users & auth

- Sign in with **Google only**.
- Each user can belong to multiple **trips**.

### 2.2 Trips

Each **trip** has:

- A **name** (e.g. “Lapland Autumn Hike 2026”).
- A set of **participants** (users who joined via invite link).
- A fixed **packing list** (rows/items).
- Built-in **views/filters** (no custom filter builder).
- Built-in **summary metrics** (no custom metric builder).

Trips can be **copied**:

- Copy = full clone of trip data (items, participants, statuses, distribution assignments).

### 2.3 Fixed packing table fields (no custom columns)

Every trip uses the same columns:

- **Item name** (text)
- **Bringer** (participant)
- **Shared** (boolean)
- **Consumable** (boolean; relevant when Shared = true)
- **Quantity** (integer)
- **Weight (g)** (integer; per unit)
- **Status** (single-select, fixed list)
- **Category** (single-select, fixed list)

Suggested fixed lists (can be adjusted later, but not customizable by users in-app):

- **Status**: `to-buy`, `found`, `packed`
- **Category**: `clothing`, `sleep`, `cooking`, `food`, `water`, `safety`, `electronics`, `other`

### 2.4 Rows (items)

> **One row = one person bringing one specific item.**

- Multiple people bringing “the same thing” = multiple rows with the same **Item name** and different **Bringer** (and/or quantity/status).

This supports:

- Everyone tracking **their own packing** (rows where Bringer = them).
- The group seeing **all items** in one shared list.
- Shared items = rows where **Shared = true**.

### 2.5 Views & filtering (built-in only)

No custom filter creation. The app provides:

- **All items**
- **My items** (Bringer = me)
- **Shared gear** (Shared = true)
- **To buy** (Status = to-buy)
- **Packed** (Status = packed)
- Optional: simple **search** (by item name)

### 2.6 Summary (built-in metrics only)

No custom metrics. The **Summary** tab shows a fixed set of useful tables, such as:

- **Total weight per person** (sum of Quantity × Weight)
- **Shared weight per person** (same, but Shared = true)
- **Consumable vs non-consumable shared weight per person**
- **Counts by status per person** (to-buy / found / packed)
- **Weight by category** (overall, and/or per person)

### 2.7 Distribution

The **Distribution** tab handles **shared gear weight distribution**.

- Uses only items where **Shared = true**.
- Splits shared items into:

  - **Consumable shared items** (Consumable = true)
  - **Non-consumable shared items** (Consumable = false)

Users can:

- Run **“Suggest distribution”** to balance shared weight between participants (separately for consumable / non-consumable).
- Manually adjust who **carries** each shared item.
- Re-run suggestion anytime.

Important rule:

- Distribution assignments **live only on the Distribution page**.
- They **do not overwrite** the **Bringer** in the packing list.

  - Packing list = who _brings/owns_ the item.
  - Distribution = who _carries_ it on the trip.

---

## 3. Pages & navigation

### 3.1 Global navigation

- After login, user goes to their **most recently opened trip**.
- From any trip: **Back to trips** → trip list.

### 3.2 Trip list page

- Shows trips the user is a member of.
- Actions:

  - Open trip
  - Create new trip
  - Copy trip

### 3.3 Inside a trip – tabs

Top-level tabs:

- **Packing | Distribution | Summary**

#### Packing tab

- Fixed-column table (no schema editing).
- Actions:

  - Add/remove rows
  - Inline edit values (Bringer, Shared, Consumable, Quantity, Weight, Status, Category)

- Views:

  - Switch between built-in views (All / My items / Shared / To buy / Packed)
  - Optional search

#### Distribution tab

- Shows only **Shared = true** rows.
- Two sections if relevant:

  - Consumable shared
  - Non-consumable shared

- Actions:

  - Suggest distribution
  - Manual adjustments
  - Re-run suggestion

#### Summary tab

- Displays the built-in summary tables/metrics (no customization).

---

## 4. Key MVP use cases (updated)

1. **Plan a trip**

   - Create trip, invite people.
   - Add items with bringer, weight, quantity, shared/consumable flags, status, category.

2. **Track my packing**

   - Use **My items** view.
   - Update **Status** as you buy/find/pack items.

3. **Coordinate shared gear**

   - Mark group items as **Shared** (+ Consumable when relevant).
   - Use **Shared gear** view to review coverage.

4. **Balance shared weight**

   - Go to **Distribution**, run **Suggest distribution**.
   - Adjust manually if needed.
