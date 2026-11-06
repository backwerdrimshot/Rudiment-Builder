# Right rudiment browser prototype

Design record, based on release 2026-11-06.2 / 747c888. The browser changes do not alter musical data; release 2026-11-06.3 integrates the separately reviewed ten-stroke correction.

At 1400 CSS pixels and wider, Choose rudiment opens a 390px right browser. The practice area reserves space rather than being covered. Selection retains the browser, selected card state, and existing selectRudiment playback reset behavior. Collapse restores the full practice area. Browser is nonmodal, so keyboard and pointer users can return to practice controls without closing it.

Below 1400px it becomes a full-height modal with inert background, labeled dialog, Tab boundary wrapping, Close/Escape restoration and one-tap selection return. Resizing an open browser transitions between modes and focuses its close control. Search/family and lead controls have 44px minimum height; existing notation assets stay unchanged.

Settings alternatives: on very wide screens the shipped settings column still appears when the browser is collapsed. When the right browser is open, Settings returns to its top disclosure rather than creating competing right columns. On narrower screens existing settings behavior remains.

Independent browser review passed at 320, 375, 1399, 1400 and 1920px, including modal transitions, focus restoration, sidebar playback and contrast. The native dialog max-width cap was removed after review. Combined release checks: 174 Node tests, 2,056 hand-event parity checks, ten-stroke browser regression and scheduler-stall regression passed locally. Physical-device, actual screen-reader and human auditory checks remain unverified.
