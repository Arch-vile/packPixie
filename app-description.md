# Pack Pixie —Product Specification

## 1. Purpose

Pack Pixie is a collaborative web app for hiking groups to plan trip packing together.

Its purpose is to help a group answer four practical questions:

1. **What items are needed for this trip?**
2. **Who is responsible for bringing each item?**
3. **Who will use each item?**
4. **How should shared carrying weight be distributed fairly among the people who benefit from it?**

Pack Pixie is meant to replace ad hoc spreadsheets and chat coordination with a purpose-built shared planning workflow.

---

## 2. Product goal

The goal of Pack Pixie is not just to list items, but to support **group packing coordination across repeated trips**.

It combines three jobs in one app:

- **Packing planning**
  Keep a shared list of trip items and track who is responsible for bringing them.

- **Packing progress tracking**
  Let participants see what they are bringing this time and track whether those items are still to buy, found, or packed.

- **Shared carry distribution**
  Help the group distribute the burden of shared items fairly based on who actually uses those items.

The key idea is that **bringing an item**, **using an item**, and **carrying an item** are related but separate concepts.

---

## 3. Product overview

A Pack Pixie trip contains a shared packing table. Each row represents one planned item entry for that trip.

For each item, the app can track:

- what the item is
- how many units there are
- how much it weighs
- who is responsible for bringing it
- who uses it
- how its carried quantity is distributed across participants
- whether it is consumable
- what its packing status is
- what category it belongs to

This allows the app to support both simple and more advanced cases:

- a personal item brought, used, and carried by the same person
- a shared item used by the whole group
- a subgroup item used by only part of the group
- one person bringing several units of something while multiple people carry those units
- a manually fixed carrier assignment that the suggestion algorithm must not change

The app is primarily used as a **personal packing workspace with shared trip context around it**.

---

## 4. Primary usage model

## 4.1 Reuse-first product model

Pack Pixie is mainly used by an existing hiking group that repeats trips and adapts previous plans.

The normal way to start a new trip is:

- copy the most recent trip
- confirm or adjust participants
- review and update the copied item list for the new outing
- track personal packing progress
- review shared item coverage
- near the end, use Distribution to settle shared carrying

The product is therefore **reuse-first**, not blank-start-first.

---

## 4.2 Personal-default working model

Although the trip is collaborative, normal day-to-day use is centered on the participant’s own responsibilities.

The app should primarily help a participant answer:

- **What am I bringing this time?**
- **What is the status of those items?**

Shared planning remains important, but it is secondary to this personal working view during most of the trip lifecycle.

---

## 4.3 Shared planning as secondary context

Participants move out of their personal view mainly to answer shared planning questions such as:

- are shared items covered by someone?
- who is assigned as using each shared item?
- later, how should shared carrying be balanced fairly?

Shared planning is important, but it is not the app’s default everyday mode.

---

## 5. Core product concepts

## 5.1 Trip

A **trip** is the main collaboration space in the app.

A trip has:

- a name
- a set of participants
- a shared packing table
- distribution views
- summary views

A user may belong to multiple trips.

Old trips mainly exist as **templates for future trips**.

---

## 5.2 Participants

All people referenced in the app must be trip participants.

This applies to:

- the person responsible for bringing an item
- the people who use an item
- the people carrying units of an item

Participants also define trip access.

A user should have access to any trip they are a participant in.

There are no special admin permissions in the current specification. All trip participants collaborate under the same general editing model.

---

## 5.3 Item row

An item row represents one trip item entry.

It can describe either:

- a personal item
- a shared item used by multiple people
- or a currently unassigned possible trip item

A row may represent:

- a single unit
- or multiple units of the same item

Examples:

- “Tent”, quantity 1
- “Meal pack”, quantity 4

The row is the main planning object. Carry distribution may further divide that row’s quantity across multiple participants.

If multiple participants each bring their own real-world version of something, that should normally be modeled as **separate rows per person**, not as one shared row.

Example:

- boots for Anna
- boots for Ben
- boots for Cara

This is especially important when the items differ in real properties such as weight.

---

## 5.4 PackedBy

`PackedBy` means:

> the participant responsible for bringing the item on the trip

This is the key planning assignment.

If an item has no `PackedBy`, it is not currently assigned to be brought on the trip.

`PackedBy` drives:

- whether the item is actively part of the trip plan
- whose personal working view the item appears in
- whether the row counts as part of someone’s packing responsibility

---

## 5.5 UsedBy

`UsedBy` means:

> the set of participants who use or benefit from the item

This is a set of trip participants, with no duplicates.

Examples:

- personal sleeping bag → one user
- stove used by whole group → all participants
- tent shared by two of three people → two participants

`UsedBy` is used for:

- shared-weight fairness calculations
- distribution suggestion logic
- shared-item filtering and visibility

Usage share is always assumed to be equal among the listed users.

---

## 5.6 Carried quantities

Pack Pixie separates responsibility for bringing an item from responsibility for carrying it during the trip.

Carrying is modeled as **per-person carried quantities**.

This means an item can be brought by one person but carried by one or more people.

Examples:

- quantity 1 tent → one carrier assignment of 1
- quantity 4 meal packs → split across several carriers

For each row, the total carried quantity:

- may be less than the row quantity during planning
- must never exceed the row quantity

Unassigned remainder is allowed and should be visible in Distribution.

---

## 5.7 Shared vs personal items

The app does not model “shared” as a simple boolean.

At a high level:

- **personal item**: usually one user, same person responsible and carrying
- **shared item**: item used by multiple participants

For normal Packing usage, the main high-level shared relevance rule is:

- an item is relevant to **shared planning** when it has **2 or more users**

Distribution may also surface additional mismatch or incomplete cases, but shared planning at the Packing level is primarily defined through multi-user `UsedBy`.

---

## 5.8 Consumable

`Consumable` is a property of the item itself.

It may be set on any item, including personal items.

Consumable and non-consumable items use the same general distribution logic, but fairness calculations are handled separately.

Examples of consumables:

- food
- fuel

Examples of non-consumables:

- tent
- stove
- sleeping pad

---

## 5.9 Status

Status represents packing progress for the row as a whole.

Current status options are:

- `to-buy`
- `found`
- `packed`

Status is row-level only. There is no partial per-unit status tracking in MVP.

An item may be marked `packed` only if `PackedBy` is set.

---

## 6. High-level user flows

## 6.1 Main lifecycle flow

The normal lifecycle of a trip is:

1. Create a new trip by copying the most recent trip
2. Confirm or adjust participants
3. Enter the trip
4. Review and update the copied item list for this outing
5. Participants mainly work through their own assigned items
6. Participants check shared item coverage when needed
7. Near the end, once shared items are basically decided, use Distribution
8. Fine-tune carrying assignments in Distribution
9. Close to departure, participants finalize packing status on their own items
10. Later, copy this trip as the basis for the next one

This is the core usage loop of the product.

---

## 6.2 Day-to-day participant flow

In normal use, a participant opens a trip mainly to:

- see what they are bringing this time
- update the status of those items
- occasionally add, remove, or unassign items
- occasionally inspect shared items

The app should support lightweight ongoing adjustment rather than a rigid staged workflow.

There does not need to be a formal “review phase” that all users must consciously perform.

---

## 6.3 Shared coverage flow

When participants leave their personal view and look at shared items, their main goal is usually:

- to check that shared gear is covered by someone
- to check who is assigned as using that shared gear

This happens before Distribution and is mainly about making sure the trip plan itself is sensible.

---

## 6.4 Distribution flow

Distribution becomes relevant **near the end**, not throughout the whole planning process.

The normal trigger is:

- after discussion, the group concludes that the shared items for the trip are about 99% decided and inserted

At that point, Distribution should:

- suggest a fair shared carry plan
- allow manual tweaking
- remain the active workspace until the carry plan feels settled

Distribution is therefore a **late-stage balancing tool**, not the primary planning surface.

---

## 6.5 Final pre-departure flow

After Distribution is settled, the main remaining use is personal packing completion.

Close to departure, each participant should mainly be able to confirm:

- **my assigned items are actually packed now**

Some items may only become `packed` right at departure time, for example cold-storage food packed immediately before leaving home.

Last-minute item changes may still happen, but these are less likely to affect shared planning.

---

## 7. Trip creation and reuse

## 7.1 Primary trip creation action

The primary way to create a new trip is:

- **copy most recent trip**

Creating a blank trip is secondary.

---

## 7.2 Role of old trips

Old trips mainly function as:

- reusable templates for future trips

They are not primarily historical records.

When choosing a trip to copy from, the most important heuristic is usually:

- **most recent trip**

---

## 7.3 What copy should preserve

When a trip is copied, it should keep everything from the previous trip **except packing status**.

At a high level, copy should preserve:

- participants as the starting point for participant selection
- item rows
- responsibility assignments
- usage assignments
- carry setup
- other planning structure

But it should clear:

- packing status

The new trip is therefore a copied planning setup with execution progress reset.

---

## 7.4 Mandatory participant confirmation

Because trip access depends on participation, a copied trip must require a participant selection step before normal use.

That step should:

- prefill participants from the copied trip
- let the creator adjust that set
- require explicit confirmation before proceeding

It must be possible that:

- someone is dropped
- someone new is added

---

## 7.5 Entering the trip after creation

After participants are confirmed and any required copy adjustments are applied, users should go straight into the trip.

The app should not interrupt the flow with a separate forced review screen of affected items.

---

## 8. Participant-change behavior during copy

Participant changes during copy can invalidate item state. The app must preserve useful planning information while avoiding misleading carry-over.

## 8.1 Personal-item rule for removed participants

If an item’s `UsedBy` was exactly one person, and that person is no longer a participant in the new trip, treat the row as that removed participant’s personal item.

In that case:

- keep the row in the list
- clear its trip-specific fields

The point is to keep the item visible as a reusable idea, but not keep it as an active current-trip responsibility.

---

## 8.2 Non-personal affected items

If an affected item was **not** a single-person item from a removed participant, preserve it as an active planning item.

For such items:

- if previous `PackedBy` is no longer in the trip, set `PackedBy` to the **trip creator**
- set `UsedBy` to **all participants**
- clear carried assignments

This makes the item stay visible and treated as something the new group should actively reconsider.

---

## 8.3 UsedBy cleanup for removed participants

For items affected by participant changes, if the item is not handled by the personal-item rule above, usage should be reset to a valid group-level default rather than left partially stale.

The practical rule for this spec is:

- affected non-personal items default to `UsedBy = all participants`

---

## 8.4 Carried assignment reset

For affected items where participant changes invalidate previous carrying assumptions:

- clear carried assignments

This prevents misleading carry-over from a previous group composition.

---

## 9. Inside a trip

Each trip has three main sections:

- **Packing**
- **Distribution**
- **Summary**

Of these, **Packing** is the primary everyday section.

---

## 10. Packing section

## 10.1 Purpose

The Packing section is the main editable table for trip items.

It is where participants:

- add items
- assign responsibility
- track status
- refine usage
- review what is planned for the trip

This is the main day-to-day workspace of the app.

---

## 10.2 Default trip view

When a participant opens a trip, the default view should be the normal Packing table with a pre-applied filter:

- `PackedBy = me`

This is not a separate mode. It is the main Packing view with a default personal filter.

This default view exists because the participant’s first question is usually:

- what am I bringing this time?
- what is the status of those items?

---

## 10.3 Main alternate context in Packing

The main broader context a participant needs beyond their own items is:

- shared items

Participants should move from the default personal view to shared context mainly by changing filters within the same Packing view.

The app does not need a separate hard-coded shared tab for this.

---

## 10.4 Shared planning relevance in Packing

Within Packing, the shared-oriented view should mainly show:

- items currently relevant to shared planning

At the highest level, that means:

- items where `UsedBy` has 2 or more participants

This shared view should be focused and not just a full list with shared items visually emphasized.

---

## 10.5 Item addition

If the list is empty, items appear when participants add rows to the trip’s shared packing table.

In normal use, users always add **brand-new rows directly into the trip**.

There is no separate reusable item library in this specification.

The common intent when adding is often “I am adding something I will bring,” but the app still creates a normal trip row rather than a special personal-item object.

---

## 10.6 New row defaults

When a participant adds a new row:

- `PackedBy` should default to the current user
- `UsedBy` should default to the current user

This makes the common case fast, while still allowing later editing into shared cases.

Other fields are filled in by the user as needed.

Because visibility is driven mainly by `PackedBy`, a newly added row should immediately appear in that participant’s default personal view.

---

## 10.7 Table fields

The packing table includes fixed columns.

Core row properties:

- Item name
- Quantity
- Weight (g) per unit
- PackedBy
- Status
- Category
- Consumable

Usage-related data:

- UsedBy

Carry-related data:

- carried assignments are logically part of the item, but are mainly reviewed and edited in Distribution-oriented workflows

The schema is fixed and not user-customizable.

---

## 10.8 Packing filters

Instead of built-in quick views based on a hard-coded shared boolean, the Packing section supports flexible filters.

Supported filters include:

- PackedBy
- CarriedBy
- UsedBy
- Status
- Category
- Consumable

Search:

- free-text search by item name

Filter behavior:

- OR logic within one filter field
- AND logic between different filter fields
- search combines with filters using AND

Participant-related filters should support:

- one or more selected participants
- empty / unassigned state where relevant

For `UsedBy`, multiple selected people mean:

- item used by Anna **or** Ben

---

## 10.9 Important everyday filtering use

After the default `PackedBy = me` view, the most important quick refinement is:

- filtering my items by status

No single status slice dominates at the product level. Users may care equally about:

- things still to buy
- things found but not packed
- anything not yet packed

So the app should make all status-based slices easy.

---

## 11. Shared-item responsibility changes

## 11.1 Flexible responsibility correction

When users review shared items and notice that something is covered by the wrong person or by no one, there does not need to be one required behavior.

Any of these are normal:

- directly changing `PackedBy`
- unassigning first and reassigning later
- discussing outside the app and updating afterward
- deleting the item if it is not needed

The app should support these without assuming one rigid correction pattern.

---

## 11.2 Unassignment as a normal action

If a participant sees an item assigned to them that they are not actually bringing this time, a normal action is:

- unassign themselves and leave the item visible in the list

This communicates:

- **not me this time**

without forcing an immediate replacement.

If the replacement is already known, the item may also be reassigned directly.

If the item is not needed, it may be removed entirely.

---

## 12. Distribution section

## 12.1 Purpose

The Distribution section exists to manage carrying assignments for items where carrying and usage are not trivially aligned.

It answers questions like:

- who should carry which shared items?
- which items are missing carry assignments?
- who currently carries more shared burden than they owe?
- who currently carries less shared burden than they owe?

---

## 12.2 Timing of use

Distribution is mainly used near the end of planning, once the group feels that the set of shared items for the trip is basically settled.

It is not intended to be the main everyday planning surface.

---

## 12.3 What appears in Distribution

An item is relevant to Distribution when carrying and usage are not trivial.

This includes:

- items with 2 or more users
- single-user items with missing carrying assignment
- single-user items where the carrier differs from the user
- items with incomplete data that prevent suggestion, but should still be highlighted

An item with exactly one user and that same user carrying it is trivial and should not appear in Distribution.

---

## 12.4 What Distribution highlights

Distribution should clearly highlight items missing information needed for fair suggestion, such as:

- missing `PackedBy`
- missing `UsedBy`
- missing weight
- missing carried assignment or incomplete carried quantities

It should still show these items when relevant, but mark them as incomplete.

---

## 12.5 Consumable and non-consumable separation

Distribution uses the same logic for consumable and non-consumable items, but handles them in separate balancing passes.

The system therefore treats them as two separate fairness spaces:

- consumable shared burden
- non-consumable shared burden

---

## 13. High-level fairness model

Pack Pixie’s distribution logic is based on one principle:

> A participant’s shared carried weight should match, as closely as possible, the shared weight they owe based on the items they use.

This is the core fairness rule.

The app does **not** aim to:

- equalize total backpack weight
- compensate for personal items
- compensate for someone voluntarily bringing something extra just for themselves

It aims to fairly distribute the burden of shared-use items.

### Example

If a tent is used by Anna and Ben:

- the tent’s shared burden belongs to Anna and Ben
- if Cara carries it, that is allowed only if manually fixed
- the app should compensate elsewhere so Anna and Ben still carry their fair share of shared weight overall

---

## 14. Distribution suggestion — high-level behavior

## 14.1 Purpose

The suggestion feature should propose carrying assignments that bring each participant’s shared carried weight as close as possible to the shared burden they owe.

---

## 14.2 What suggestion requires

An item may participate in suggestion only if it has:

- `PackedBy`
- `UsedBy`
- weight

Items missing these should be shown as incomplete, not suggested.

Items with status `to-buy` may still participate if they are planned to be brought.

---

## 14.3 Assignment behavior

Suggestion should:

- assign missing carried quantities
- rebalance movable non-manual quantities
- keep manual fixed portions unchanged
- always try to assign the full remaining quantity
- choose the closest possible balance if perfect fairness is impossible

---

## 14.4 Split quantity behavior

For items with quantity greater than 1:

- carrying may be split by whole units
- one person may still carry all units
- manual assignments lock only the assigned portion
- unassigned remainder stays available for suggestion

---

## 14.5 Manual override behavior

If a user manually changes carried assignments:

- that manual portion becomes fixed
- the algorithm must not change that portion
- if the user later reduces or removes that manual portion, the removed amount becomes unassigned remainder

---

## 15. Collaboration model

The collaboration model is intentionally permissive.

General rule:

- any trip participant can edit item fields

But:

- if the editor is not the current `PackedBy`, the UI should ask for confirmation

This applies broadly to:

- `PackedBy`
- `Status`
- `UsedBy`
- other row fields
- carried assignments

The goal is to keep collaboration easy, while making edits to someone else’s responsibility explicit.

---

## 16. State defaults and high-level transitions

## 16.1 When PackedBy is set

When an item that was previously unassigned gets a `PackedBy` value:

- the item becomes actively assigned to be brought on the trip
- `UsedBy` should default to `{PackedBy}` if it does not already have a valid user choice

This creates a natural default personal-item state.

---

## 16.2 When PackedBy changes

If `PackedBy` changes:

- nothing else changes automatically by default

Exception:

- if `UsedBy` was still exactly the old auto-default, then it should update to the new `PackedBy`

This preserves user customization while keeping defaults convenient.

---

## 16.3 When PackedBy is cleared

If `PackedBy` is cleared:

- the item is no longer actively assigned for the trip
- trip-specific planning state should be reset

Reset:

- `UsedBy`
- carried assignments
- `Status` to empty / unselected

Keep:

- Item name
- Quantity
- Weight
- Consumable
- Category

This reflects the idea that the item definition remains, but its current trip assignment is removed.

---

## 16.4 Packed status rule

An item may be marked as `packed` only if `PackedBy` is set.

At a practical workflow level:

- a person can only meaningfully mark an item packed when they are the one responsible for bringing it

---

## 17. Summary section

## 17.1 Current status of Summary in this specification

Summary is intentionally left less defined than Packing and Distribution in this iteration.

Its detailed role, tables, and presentation can be specified later.

---

## 17.2 High-level purpose

At a high level, Summary exists to help the group understand the current overall state of the trip.

Likely topics include:

- who is bringing what
- who is using what
- who is carrying what
- where weight is concentrated
- where shared fairness is unbalanced
- how packing progress is developing

But the exact Summary structure is not finalized in this version.

---

## 18. Main use cases covered

## 18.1 Reuse a recent trip as the basis for a new one

The group creates a new trip by copying the most recent trip, adjusts participants, and starts from that prior plan.

## 18.2 Review and update personal responsibilities

Each participant opens the trip and mainly works through the items they are currently responsible for bringing.

## 18.3 Track packing readiness

Each participant updates item status as they buy, find, and pack things.

## 18.4 Plan personal items

A participant adds items that only they use and bring.

## 18.5 Plan shared items used by everyone

The group adds items such as a stove or fuel that all participants benefit from.

## 18.6 Plan subgroup items

The group adds items used only by part of the group, such as a two-person tent on a three-person trip.

## 18.7 Check shared item coverage

Participants review shared items to make sure the group-relevant gear is actually covered by someone.

## 18.8 Unassign or reassign responsibility

A participant can indicate “not me this time” by unassigning themselves, or directly hand responsibility to someone else.

## 18.9 Distribute shared burden fairly

Near the end of planning, the group uses Distribution to assign carried quantities so shared burden is fair relative to usage.

## 18.10 Support manual overrides

The group can manually fix some carrying decisions, and let the suggestion logic balance around them.

## 18.11 Handle split quantities

One participant can be responsible for bringing multiple units, while the carrying of those units is split among several participants.

## 18.12 Reuse a completed trip later

Once the trip is over, it remains mainly as a template for the next outing.

---

## 19. Product philosophy

Pack Pixie should feel like a planning tool for real hiking-group logistics, not just a checklist.

Its defining characteristics are:

- collaborative but structured
- reuse-first
- personal-default in everyday use
- simple enough for common cases
- expressive enough for shared gear realities
- focused on shared fairness, not generic spreadsheet flexibility
- centered on the distinction between:
  - who brings an item
  - who uses an item
  - who carries an item

That distinction is the core of the product.

---

## 20. Open points not yet finalized

A few details remain intentionally open for a later iteration:

- exact Summary structure and wording
- exact presentation of carried assignments in Packing vs Distribution
- invitation flow and participant management UX details
- blank-trip creation UX
- precise suggestion algorithm mechanics and tie-breaking rules
- exact validation/error presentation
- exact quick-filter and saved-filter UX

If you want, next I can turn this into a cleaner **PRD-style version** with:

- canonical rules
- explicit invariants
- user flows grouped by phase
- and a shorter, more product-ready introduction.
