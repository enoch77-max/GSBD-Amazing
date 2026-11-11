# Project Log: GSBD-Amazing

- **Repository**: [https://github.com/enoch77-max/GSBD-Amazing](https://github.com/enoch77-max/GSBD-Amazing)
- **Local Directory**: `D:\Websites\Website designs\E-commerce\GSBD-Amazing`
- **Visibility**: Public
- **Production Branch**: `main`
- **Stack**: React 19, Vite 7, Next.js Compatibility, Tailwind CSS 4, Drizzle ORM, Embedded Postgres

---

## Project Overview
GSBD-Amazing is a dual-deployment e-commerce platform for Glowing Space BD that supports both a lightweight Vite static client build with single-file preview and a full-featured backend with database access, custom battery pack building, live inventory search, wishlist, and printable invoices.

---

## Update & Commit History

### [ecb8ee5] — 2026-11-11 18:44:00 (+03:00)
- **Archive Source**: `gsbd-amaizing-t1.zip` (Updated build)
- **Type**: Availability Matching, BOM Stock Engine & Storefront Sidebar
- **Summary**:
  - Added real-time Pack Availability Matching engine (`src/lib/pack-availability.ts`) checking catalogue stock against full bill of materials and local bag usage.
  - Added verified ready-pack specifications parser (`src/lib/ready-pack-specs.ts`) for physical pack catalog entries.
  - Integrated pack availability UI components (`pack-availability.tsx`, `pack-change-dialog.tsx`, `confirm-remove-dialog.tsx`).
  - Added desktop category sidebar navigation (`desktop-category-sidebar.tsx`) and enhanced storefront layouts.
  - Added documentation in `docs/PACK_MATCHING.md` and test scripts (`scripts/pack-availability-regression.mjs`, `scripts/pack-matching-e2e.mjs`).
  - Preserved all existing product photos and media assets in `public/images/`.

### [5d29e3e] — 2026-11-11 11:50:50 (+03:00)
- **Archive Source**: `gsbd-amaizing-t1.zip` (Initial tier)
- **Type**: Major Pack Engine & Intelligence Upgrade
- **Summary**:
  - Upgraded Pack Builder with intelligent load-based calculations, runtime estimates, and device presets (`pack-planning.ts`).
  - Added smart pack recommendations engine (`pack-recommendations.ts`) and API route (`src/app/api/pack-recommendations/`).
  - Added Admin Pack AI advisor (`admin-pack-ai.tsx`) for automated pack advice and configuration assistance.
  - Replaced legacy visual component with modular `pack-planner.tsx` and `planner-boundary.tsx`.
  - Added automated navigation and pack regression test suites (`nav-scroll-e2e.cjs`, `pack-regression.mjs`).
  - Preserved all product photo assets and restored SVG illustration graphics.

### [1f536f4] — 2026-11-10 23:57:41 (+03:00)
- **Author**: `enoch77-max`
- **Type**: Feature Expansion & Architecture
- **Summary**:
  - Integrated custom battery pack builder with interactive cell and voltage selector.
  - Added user wishlist functionality and persistent state.
  - Added live instant search across product catalogs and SKUs.
  - Built printable invoice generator for customer orders.
  - Configured dual deployment supporting both Vite static preview and full Next.js/Node backend.

### [d4e07fa] — 2026-11-10 15:49:53 (+03:00)
- **Author**: `enoch77-max`
- **Type**: Configuration
- **Summary**:
  - Added `.env.example` file documenting standard `DATABASE_URL` and environment settings.

### [e10de09] — 2026-11-10 10:38:07 (+03:00)
- **Author**: `enoch77-max`
- **Type**: Initial Setup
- **Summary**:
  - Initial repository setup and base project structure for GSBD-Amazing.

---

## Sensitive Guidelines & Project Invariants
- Preserve all existing product media under `public/images/`.
- Ensure dual build scripts (`npm run build` and `npm run server:build`) remain functional.
- When applying updates from `.zip` archives, keep the archive on disk and never delete it.
