# Right rudiment browser prototype

Local only, based on release 2026-11-06.2 / 747c888. No deployment or musical data changes.

At 1400 CSS pixels and wider, Choose rudiment opens a 390px right browser. The practice area reserves space rather than being covered. Selection retains the browser, selected card state, and existing selectRudiment playback reset behavior. Collapse restores the full practice area. Browser is nonmodal, so keyboard and pointer users can return to practice controls without closing it.

Below 1400px it becomes a full-height modal with inert background, labeled dialog, Tab boundary wrapping, Close/Escape restoration and one-tap selection return. Resizing an open browser transitions between modes and focuses its close control. Search/family and lead controls have 44px minimum height; existing notation assets stay unchanged.

Settings alternatives: on very wide screens the shipped settings column still appears when the browser is collapsed. When the right browser is open, Settings returns to its top disclosure rather than creating competing right columns. On narrower screens existing settings behavior remains.

172 automated tests pass. Dedicated browser breakpoint/layout/keyboard review remains pending. Do not treat this prototype as deployment approval. The ten-stroke correction is developed in a different checkout and is not included here.
