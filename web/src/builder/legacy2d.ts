/**
 * `?legacy2d=1` keeps the hand-drawn SVG bike and rider reachable (dev and production) for one release, so the
 * orthographic render of the 3D scene can be compared against it. Delete this, the legacy blocks it gates and
 * `buildFrontalMannequin` in a follow-up PR (docs/plans/ortho-views.md, Phase 3).
 */
export const legacy2d = (): boolean => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("legacy2d") === "1";
