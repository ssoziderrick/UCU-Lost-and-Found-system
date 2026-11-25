# Phase 3 — Reports, campus locations and images: API contract

All paths are under `/api`. Errors are `{ "error": string, "fields"?: { [field]: string } }`.

## Data changes (migration 003)

| Change | Why |
|---|---|
| `locations` renamed `campus_locations`, with `zone_id`, `kind`, `description`, `is_active`, `sort_order` | Structured campus directory that admins manage; zones let matching score "nearby" places in Phase 4 |
| New `campus_zones` | Groups locations (Libraries, Academic blocks and labs, Gates, Sports, Halls, Dining, Other) |
| The 16 locations supplied for v2 added; v1 locations kept | Existing reports keep their location. **Paul Mukasa Library** (supplied) and **Hamu Mukasa Library** (v1) both exist until the official name is confirmed; an admin deactivates the wrong one |
| `categories` gain `parent_id`, `is_active`, `sort_order`; groups added (Electronics, Academic, Personal items, Documents and IDs); new leaves "Calculators and academic equipment", "Laptops and chargers", "Umbrellas", "Eyewear" | Grouped choices in forms; "same group" scoring in Phase 4 |
| `reports.private_details` moved to `report_confidential(report_id, identifying_details)` | Public queries can't leak it by accident: it has to be joined explicitly |
| `reports.custody` (`with_finder`, `lost_property_office`, `other`) and `custody_note` | Where a found item is now |
| `report_photos` (one BLOB per report) replaced by `report_images` + `image_blobs` | Up to 4 images per report, each `public` or `private`, one cover, random 32-byte storage keys |
| Permissions `locations.manage`, `categories.manage` (super admin, officer) | Admin setup screens |

Reference codes are derived, not stored: report 42 is `FD-000042`.

## Lookups

`GET /reports/meta` → `{ categories, categoryGroups, locations, zones }`, active entries only. Each category has `{ id, name, parentId, group }`; each location `{ id, name, zoneId, zone, kind }`.

## Reports

| Method | Path | Notes |
|---|---|---|
| GET | `/reports?q&type&categoryId&locationId&zoneId&dateFrom&dateTo&status&sort&page` | `q` also matches a reference code (`FD-000042` or `42`). `categoryId` may be a group: its children are included. `sort` = `recent` (default: open first, newest event) or `oldest`. Items carry `refCode` and `coverImage` (`{ url }` or `null`), never confidential data or private images. |
| GET | `/reports/:id` | Public fields, `refCode`, `custody`, public images. Owner and admins also get `identifyingDetails`, `custodyNote` and private images. |
| POST | `/reports` | multipart. Fields as before plus `custody`, `custodyNote` (found only) and `identifyingDetails` (found only). Files: `photos` (0–4), with `photoVisibility` (one `public`/`private` per file, default `public`). The first public photo becomes the cover. |
| PUT | `/reports/:id` | JSON (no files). Owner only, while open. Type can't change. |
| POST | `/reports/:id/images` | multipart `photos` + `photoVisibility`. Owner only, while open. Total stays ≤ 4. |
| PATCH | `/reports/:id/images/:imageId` | `{ visibility?, isCover? }`. A private image can't be the cover. |
| DELETE | `/reports/:id/images/:imageId` | If it was the cover, the next public image becomes the cover. |
| GET | `/images/:key` | The image bytes. Public images of visible reports: anyone. Private images, or any image of a removed report: owner and admins only; others get 404. `Cache-Control: private`, `X-Content-Type-Options: nosniff`. |

Image rules: JPEG, PNG or WebP detected from the file's bytes (not its name), at most 5 MB each and 6000 px on either side. Metadata that can carry GPS or device details is removed before storage: JPEG APP1 (EXIF/XMP), PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME` chunks, WebP `EXIF`/`XMP ` chunks.

## Admin

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/locations` | locations.manage — all locations (active and inactive) with report counts |
| POST | `/admin/locations` `{ name, zoneId, kind, description?, sortOrder? }` | locations.manage |
| PATCH | `/admin/locations/:id` `{ name?, zoneId?, kind?, description?, sortOrder?, isActive? }` | locations.manage |
| GET / POST | `/admin/zones` `{ name }` | locations.manage |
| GET | `/admin/categories` | categories.manage |
| POST | `/admin/categories` `{ name, parentId? }` | categories.manage |
| PATCH | `/admin/categories/:id` `{ name?, parentId?, isActive?, sortOrder? }` | categories.manage — a group can't be given a parent, and a category with reports can't become a group |

Nothing is hard-deleted: deactivating hides a location or category from new reports and filters, and existing reports keep it. Every change is written to the audit log.
