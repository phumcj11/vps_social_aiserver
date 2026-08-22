# Media Library — Storage Architecture (pilot decision)

Chosen for the pilot: **VPS-local persistent directory**, mirroring the existing
`storage/` convention (browser-profiles, screenshots, runtime). No S3/R2/MinIO —
there is no existing object-storage requirement and the pilot is single-VPS.

## Location & durability

- Root: `storage/media/` (relative to the API cwd `/opt/kmkt/projects/social-ai`).
- **Outside Git** — covered by adding `storage/media/*` to `.gitignore`
  (the repo already gitignores `storage/**` sub-paths).
- **Persistent across deploy/reboot** — deploys are in-place (`git pull` + rebuild
  in the same working tree), never a fresh clone, and `storage/` is never touched
  by the build; `.next`/`dist` are separate. The directory survives reboots
  because it lives on the VPS disk, owned by the `kmkt` service user.
- **Not** inside `.next` / `dist` / any temp dir.
- Ownership: `kmkt:kmkt`, mode `750` (service reads/writes; not world-readable).

## Safe keys (mirrors `execution/evidence-storage.ts`)

- Storage key is an **opaque relative path** the server generates:
  `storage/media/{workspaceId}/{businessId}/{assetId}.{ext}`.
- Every path component is a validated UUID (no `..`, no separators, no absolute
  markers). The filename is `{assetId}.{ext}` where `assetId` is a server UUID and
  `ext` is derived from the validated MIME (`jpg`/`png`/`webp`) — never from the
  client filename.
- The client-supplied `originalFilename` is stored for display only and is never
  used to build a path.

## Serving (no public path exposure)

- Files are served **only** through a controlled API route:
  `GET /businesses/:id/media/:assetId/file` — authenticated, workspace + business
  ownership enforced (cross-workspace → 404), streams the bytes from disk with the
  stored `mimeType`. The raw filesystem path is never returned to the browser.
- Caddy topology is unchanged; no static file_server, no public directory.

## Limits & validation

- Max 10 MB per image (enforced by `@fastify/multipart` limits AND a post-read
  size check).
- Allowed: `image/jpeg`, `image/png`, `image/webp`. SVG rejected.
- MIME is validated against the **actual bytes** (magic-byte sniff), not the
  declared header or filename extension. Mismatch → rejected.

## Backup

- `storage/backups/` already exists for DB backups. Operational note: the media
  directory `storage/media/` should be included in the VPS backup routine
  (filesystem-level), since it is not in Git and not in the DB.

## Deliberately deferred (not blocking MVP)

- No `sharp`/native image processing: no server-side thumbnail generation
  (review UI scales the original via `<img>`), no EXIF auto-orient, no metadata
  stripping. Content safety comes from magic-byte validation + size/MIME limits.
  These can be added later without changing the storage contract.
