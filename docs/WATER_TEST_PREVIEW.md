# Water test preview

Application source: `8384efa` — Add optional Water evidence research preview.

Local authenticated preview: http://127.0.0.1:5174/water

Intended online destination: https://landdraft-test.tight-sky-0ae1.workers.dev/water

## Validation

- 13 Water unit/contract tests passed.
- TypeScript passed; targeted Water lint passed.
- Existing Weather regression tests also passed with Water in the shared checkout.
- Staging build passed using the existing test environment.
- Existing test deployment preparation passed its database-isolation and browser-secret scan.
- Live contracts passed in San Antonio, Phoenix and a sparse western Texas cell, including explicit outside-coverage and empty-results handling.
- Authenticated browser analysis returned aquifer extents, sensor readings and source records. Record inspection, optional-source discovery and Save were exercised.
- Mobile portrait, tablet landscape and mobile landscape DOM sizing checks found no horizontal document overflow. Full visual/accessibility regression remains pending.

## Publication status

User explicitly approved this Water preview and test destination after the initial rejection. Publication succeeded on 2026-09-13 using the existing test Worker; deployment tool returned version `612e3ab6-68c5-4c7b-8622-c5bb7dd338c6`. `/water` returns HTTP 200. Authenticated hosted analysis completed all four sources: three aquifer polygons, three sensor readings, four USGS monitoring sites and 50 GWDB records for the Central Texas test area.

A concurrent Weather release subsequently reported application revision `1f7745915a0aac70faddbba1556b43ca044eb1ec` on the shared test site. Its Water component, route and library files are unchanged from approved revision `8384efa`. That newer work was not reverted. The Water preview remains online at the destination above; production was not changed by this deployment.

### Earlier approval checkpoint (resolved)

2026-09-13: Deployment command was rejected by automatic approval review before execution. Review requires explicit approval for this Water payload and the existing test Worker destination, despite prior general online-test authorization. No Water deployment occurred in this attempt. The prepared artifact uses only the test database; existing test-provider secrets are preserved and no commercial rights are granted.

Requested approval: publish application commit `8384efa` to existing `landdraft-test`, not production. Do not retry through an alternate deployment mechanism without approval.

See [architecture, source review and phased backlog](WATER_HYDROGEOLOGY_ARCHITECTURE.md). This is an incomplete foundation preview, not the full six-phase Water module.
