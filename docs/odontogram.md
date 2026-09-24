# Odontogram

The Treatment workspace uses React Three Fiber 9.8, Drei 10.7 and Three.js 0.186 with React 19.3. Three.js types match 0.186. These versions are pinned in the web workspace and lockfile. Fiber's compatibility guidance is at https://r3f.docs.pmnd.rs/getting-started/installation.

The scene is lazy-loaded from the local application bundle. Tooth crowns, roots, optional gums, and label textures are generated locally. There are no model, font, environment-map, CDN or database requests from the renderer to external services. Electron's sandbox, context isolation, Node restrictions and CSP remain unchanged. Drei OrbitControls supplies camera controls; chart labels use canvas textures rather than DOM portals.

## Identity and orientation

FDI identifiers are numeric clinical identities, never geometry indices:

| Dentition | Upper right | Upper left | Lower left | Lower right |
|---|---|---|---|---|
| Permanent | 11–18 | 21–28 | 31–38 | 41–48 |
| Primary | 51–55 | 61–65 | 71–75 | 81–85 |

Front camera looks along negative Z. Patient right is negative X (screen left), upper is positive Y. Anterior teeth have larger Z. Occlusal presets isolate the corresponding arch. Mixed mode separates primary arches vertically and uses a smaller arch radius. The tooth picker lists right-to-left across each arch without wrapping the two sides onto mislabeled rows.

PatientChart stores the patient's chosen dentition. Display dentition and arch filters are transient React state and do not write to PostgreSQL. No inference from age is made. A primary tooth and its successor keep independent FDI identities.

ToothModel is presentation-only. Its FDI props, selection/hover callbacks and tooth-layout adapter are the integration boundary for future licensed GLB assets. The initial models are simplified procedural shapes, not anatomically accurate.

## Records and permissions

All persistence uses authenticated Fastify routes under /api/odontogram/:patientId. Each route enforces Treatment view/create/modify permissions and resolves the patient's room from the existing authorized workspace. Procedure lookup requires the same room and an active catalog record. The UI retains the existing Patient and Procedure Catalog viewing permissions for their respective selectors.

- ClinicalRecord stores immutable tooth-state events or existing findings, with date, notes, actor and recording timestamp. Voiding retains the original data and records a reason, date and actor. Findings create no treatment or charge.
- Treatment has a UUID, catalog reference, immutable catalog snapshot, exact Decimal USD price, planned date, notes, status and revision.
- TreatmentTooth stores FDI, canonical surfaces and target/abutment/pontic role. Its key is treatment ID plus tooth, allowing unlimited distinct instances against the same tooth.
- TreatmentEvent records creation, status transitions and voiding with dates, notes and actors. Status changes lock the row and check the expected revision. Completed/cancelled instances are terminal; corrections void the original with a reason and create a separate linked instance.
- Patient/procedure deletion is restricted when clinical history references them.

Independent mode creates one transactionally saved instance per selected tooth, each at the entered price. Group mode creates one instance with multiple tooth associations and one total price. Multi-tooth catalog scopes require group mode; whole-mouth scopes require group mode without tooth associations. There is no automatic invoicing or payment posting.

Surface values are mesial, distal, buccal, lingual, occlusal and incisal. Labels adapt buccal to facial anteriorly and lingual to palatal in the upper arch. Incisal applies to anterior teeth and occlusal to posterior teeth. Selection uses labeled controls; arbitrary mesh click positions are never interpreted as surfaces.

## Verification

- npm test: FDI counts, orientation, primary/permanent separation, surface validation, explicit states and existing regression tests.
- npm run test:access: isolated PostgreSQL schema; repeated instances, grouped and independent pricing, price snapshots, forbidden scopes, concurrent status edits, completed-history preservation and void/correction behavior. Browser checks cover patient selection, 32/20/52 tooth filtering, hidden selection preservation, findings, tab remounts, and forced WebGL failure. External asset requests are rejected by assertions.
- npm run typecheck and npm run build.

When WebGL is unavailable or lost, the tooth picker and record forms remain usable. A separate workspace boundary handles failed chunk loads without taking down the rest of the application. After a local build/migration, restart the running Electron app to load the matching backend, client and bundled chart.

## Inline treatment plan
The catalog autocomplete and Add procedure action create treatment instances using the catalog price and today's date. Single-tooth/surface procedures create one instance per selected tooth; multi-tooth and whole-mouth procedures retain one total price. Surface selection stays in the odontogram.

The pencil edits a planned instance's discount, date and notes using its expected revision. Its original price remains unchanged. Each edit preserves before/after values in a TreatmentEvent. Started/completed instances retain the existing correction workflow. The bin requires Treatment delete permission, confirms removal, and voids the instance without destroying history.

Plan totals are calculated from original prices minus procedure discounts, then the plan discount. Plan discount changes remain append-only ClinicalRecord entries of kind plan_total for audit compatibility; their JSON now stores the discount type/value and subtotal at save. Concurrent edits check the previous record ID.

Migration 20260930000000_plan_editing permits the plan_total record and edited audit event kinds. No renderer database access is introduced.
## Multiple plans
New Plan creates a numbered TreatmentPlan for the selected patient with its creator and timestamp. The workspace loads only the latest plan, including that plan's treatments and total override. Tooth-state events and findings remain patient-level data. Existing treatments and total overrides are migrated together into Plan 1.

New plans do not copy or delete prior treatments. If no plan exists yet, adding the first procedure creates Plan 1 atomically. Creation, procedure insertion, and total changes lock the patient row and validate the displayed plan ID, so stale windows cannot write into a newly created plan. Older plans are retained; a plan-history selector is deferred.
## Discounts
Procedure discounts store a type (amount or percent) and exact decimal value separately from the original Treatment.price and catalog snapshot. The amount and percentage controls express one discount; editing one replaces the discount definition rather than stacking both. Percentage calculations round half up to cents using integer arithmetic.

Plan discounts apply to the subtotal after procedure discounts. Fixed discounts are capped at the subtotal if procedures are subsequently removed. New saves reject negative amounts, values above the available base, and percentages above 100. Completed treatments remain immutable. Audit events retain before/after discounts.

Migration 20261002000000_treatment_discounts preserves existing procedure prices and converts earlier plan-total reductions to fixed discounts. Original override values remain in the audit JSON. Earlier totals above the subtotal cannot be represented as discounts and convert to zero discount.

## Sessions without a plan
Sessions exposes the patient selector and a procedure entry form even before a patient is chosen. Saving requires a patient and Treatment create permission. Choose teeth, an active catalog procedure, a date and optional notes; surface and multi-tooth roles reuse the odontogram controls.

POST /api/odontogram/:patientId/sessions creates patient-scoped Treatment records with a null planId, in_progress status and the server-side catalog price snapshot. This does not create a plan or affect plan totals. Existing FDI, surfaces, procedure scope, room permissions, audit events and status transitions apply. Sessions lists the latest plan's treatments together with the patient's independent session procedures.