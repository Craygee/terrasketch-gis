# LandDraft custom tools directory

The main desktop/tablet toolbar exposes **LandDraft tools**. On mobile, open Data
and select **LandDraft tools**. Both use `LandDraftTools.tsx`, keeping the directory
consistent across devices. Existing direct navigation remains available.

## Identified tools

| Tool | Existing entry point |
| --- | --- |
| Water & Hydrogeology | `/water` (foundation preview) |
| Weather & Meteorology | `/weather` |
| Storm Chaser | `/weather?view=storm-chaser` |
| Photography & Observation | `/weather?view=photography` |
| Pipeline Engineering | `/pipeline` (project editors) |
| LandDraft AI | Shared assistant panel |
| Spatial Analysis | Shared analysis panel (project editors) |
| Map & Report Composer | Shared print composer |

This directory identifies LandDraft-built workflows, not exclusive ownership of
third-party datasets, libraries, or scientific methods. Existing provider licensing,
feature flags, analysis limitations, and authorization remain enforced in each tool.
Do not add planned tools as functioning entries until they have an implemented destination.

## Verification

Type checking and targeted lint must pass. Manual checks: open the directory from
desktop and tablet toolbar and mobile Data sheet; verify keyboard focus/close,
scrolling, each module destination, and project panel actions. Editor-only actions
must be absent in a read-only project. Opening the directory must not mutate layers.
