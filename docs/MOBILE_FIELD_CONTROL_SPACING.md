# Mobile field control spacing

September 14, 2026 — production release 0.9.161.

The Field-mode movement/zoom lock buttons and MapLibre navigation controls used independently calculated bottom offsets on the same right edge. The lock buttons could cover the native zoom-in control.

`src/styles.css` now places Field-mode lock buttons in a horizontal row on the left, 13rem above the bottom plus the device safe-area inset. Native zoom/compass controls remain on the right; the left scale and bottom action dock remain clear.

Validation: production build passed. A browser layout fixture using the compiled application styles and matching control markup showed no bounding-box overlap with navigation, scale or dock at 393×667, 667×375, 320×568 and 744×900. Existing map mode at 393×667 and desktop at 1024×768 also showed no overlap. This is component layout verification, not a physical iPhone/Safari test or authenticated full-workflow test. No data, auth, parcel or database changes.

Deployment commit: 52ccf6a1. Rollback is a normal revert of its CSS change.
