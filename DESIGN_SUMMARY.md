# FlowFit — Input Design Summary

A reference for redesigning the app's input system. Covers every user input across both modes, grouped by domain, with notes on current patterns and opportunities.

---

## At a Glance

- **113+ distinct inputs** across 2 modes (Fit Builder, Fit Transfer)
- **Range sliders dominate** (~70 inputs) with no visual hierarchy between high-impact and niche controls
- **No progressive disclosure** — everything is available immediately
- **Flat section hierarchy** — collapsible groups all feel equivalent

### Input Types in Use

| Type | ~Count | Used For |
|------|--------|----------|
| Range Slider | 70 | All numeric parameters |
| Button Pills (radio) | 10 | Presets, mode switches |
| Button Toggles | 25 | Visibility on/off |
| Dropdowns | 6 | Frame model/size selection |
| Number Inputs | 6 | Direct X/Y coordinate entry (Transfer mode only) |
| Action Buttons | 5 | Reset, Show/Hide All, Fullscreen |

---

## Input Groups

### 1. Rider Body (Anthropometrics)

The most important inputs — everything else derives from these. Currently buried alongside component sliders with equal visual weight.

| Input | Unit | Range | Step |
|-------|------|-------|------|
| Height | mm | 1500–2050 | 5 |
| Inseam | mm | 700–1000 | 5 |
| Shoulder Width | mm | 300–520 | 5 |
| Torso Length | mm | 430–780 | 5 |
| Upper Arm Length | mm | 220–420 | 5 |
| Forearm Length | mm | 190–360 | 5 |
| Saddle-Hip Joint Offset | mm | 0–130 | 5 |
| Shoe Size | EU | 36–48 | 1 |

**Actions:** Reset to height-proportional defaults.

**Notes:** Height + Inseam are primary; the remaining 6 are optional overrides derived from height. This two-tier relationship (primary vs. derived) is invisible in the current UI.

---

### 2. Riding Intent / Posture

The most conceptual inputs — "what kind of riding." These set the target the solver optimises toward.

| Input | Type | Options / Range |
|-------|------|-----------------|
| Riding Preset | Button pills | Endurance (55°), Race (33°), Fast (43°) |
| Trunk Angle Override | Slider | 0–70° (1° steps) |
| Target Knee Flex | Slider | 0–45° (1° steps) |

**Notes:** Preset selection auto-sets the trunk angle slider. The relationship between the pills and the slider is the app's core "preset → fine-tune" pattern.

---

### 3. Frame Selection

Simple catalog lookup. The starting point for geometry.

| Input | Type | Options |
|-------|------|---------|
| Model | Dropdown | All models in frame catalog |
| Size | Dropdown | Model-specific sizes |

**Notes:** In Fit Transfer mode this appears **twice** (Frame A = source, Frame B = target). Frame B adds an "Auto Size" toggle. The duplication creates a side-by-side comparison workflow that could be designed as a distinct pattern.

---

### 4. Cockpit Components (Front End)

Handlebar and stem setup. Controls the rider's hand position.

| Input | Unit | Range | Step |
|-------|------|-------|------|
| Stem Length | mm | 70–150 | 1 |
| Stem Angle | ° | -17 to +17 | 1 |
| Spacers | mm | 0–40 | 1 |
| Bar Reach | mm | 65–105 | 1 |
| Bar Width | mm | 200–460 | 10 |
| Hood Reach | mm | 16–32 | 0.5 |

**Presets:** Hood Reach has pill buttons — Shimano DA (24 mm), SRAM Red (28 mm), SRAM Force (28 mm).

**Notes:** Hood Reach uses the same "preset pills above a slider" pattern as Riding Intent. Bar Width only affects the front view.

---

### 5. Saddle, Seatpost & Drivetrain (Back End)

Controls the rider's seated position and pedaling geometry.

| Input | Unit | Range | Step |
|-------|------|-------|------|
| Saddle Stack | mm | 30–120 | 5 |
| Seatpost Offset | mm | -30 to +30 | 2 |
| Rail Offset | mm | -25 to +25 | 5 |
| Crank Length | mm | 160–177.5 | 2.5 |
| Tyre Size | mm | 25–38 | 1 |

**Notes:** Seatpost Offset and Rail Offset both shift the saddle fore/aft but at different parts of the assembly. This distinction matters mechanically but may confuse non-expert users.

---

### 6. Shoes & Pedals (Foot Interface)

The contact point between rider and bike at the feet.

| Input | Type | Options / Range |
|-------|------|-----------------|
| Pedal System | Button pills | SPD-SL (6 mm), Look Keo (7 mm), Speedplay (11 mm), Time (7 mm) |
| Shoe Type | Button pills | Carbon (5 mm), Composite (9 mm), MTB (14 mm) |
| Total Foot Stack | Slider | 0–35 mm (1 mm steps) |
| Cleat Setback | Slider | -15 to +15 mm (1 mm steps) |

**Notes:** Pedal + Shoe preset selections auto-sum into Total Foot Stack. Same "preset → fine-tune" pattern as Riding Intent and Hood Reach.

---

### 7. Direct Contact Points (Transfer Mode Only)

Raw coordinate entry for users who already know their fit positions from a previous fitting session.

| Input | Axis | Unit | Range |
|-------|------|------|-------|
| Saddle | X / Y | mm | -200–100 / 500–900 |
| Hoods | X / Y | mm | 200–700 / 400–800 |
| Cleat | X / Y | mm | -50–50 / -300 to -100 |

**Notes:** These are number inputs, not sliders — the only place in the app where direct numeric entry is used. They replace the Frame A reference inputs via a mode toggle.

---

### 8. Visualization Controls

What the SVG/3D view displays. These don't affect the fit — purely visual.

**View Mode**
- Side / Front (button pills)
- 3D toggle (on/off)
- Fullscreen toggle

**Rider Visibility** (7 toggles + Show All / Hide All)
- Legs, Torso, Arms, Head, Feet, Contact Markers

**Frame Measurements** (12 toggles + Show All / Hide All)
- Stack, Reach, ETT, HT Length, HT Angle, ST Angle, ST Length, BB Drop, Chainstay, Wheelbase, Fork Length, Fork Offset

**Overlay Toggles**
- Fit Positions (on/off)
- Frame Geometry (on/off)

**Notes:** 25+ toggles for visibility alone. Currently rendered as small buttons in a dense grid. Show All / Hide All suggests users rarely want a middle state — possible opportunity for named view presets instead.

---

## Recurring Design Patterns

### Preset → Fine-Tune
Appears in 3 groups: Riding Intent, Hood Reach, and Shoes & Pedals. Button pills select a known configuration, which populates a slider. The user can then override. This is the app's most distinctive interaction pattern.

### Collapsible Sections
All input groups are behind collapsible headers. Currently they're all visually identical — no indication of which are essential vs. advanced.

### Solver-Owned Fields
In Transfer mode, several Frame B sliders are disabled at 50% opacity because the solver controls their values. Visually they still look like inputs, which creates confusion about what the user can actually change.

### Dual Frames (Transfer Mode)
Frame A and Frame B each have their own full set of component sliders. Many inputs are identical between them. This duplication is functional but creates a very long scrolling panel.

---

## Design Opportunities

1. **Input hierarchy** — Height, Inseam, Frame, and Posture Preset are the highest-impact inputs. They could be visually elevated above the dozens of component-level sliders.

2. **Progressive disclosure** — A guided flow (Rider → Intent → Frame → Components) would reduce cognitive load for new users while still allowing experts to access everything.

3. **Preset → Fine-Tune as a first-class pattern** — Formalising this into a reusable component would create consistency across the groups that use it.

4. **Solver outputs vs. user inputs** — Solver-controlled values need a visually distinct treatment (not just dimmed sliders). Consider read-only display cards or a results panel.

5. **Visualization presets** — Replace 25+ individual toggles with named view modes (e.g. "Fit Check", "Frame Dimensions", "Clean View") that set multiple toggles at once.

6. **Units & accessibility** — All values are in mm. Consider dual-unit display or a unit toggle for users more comfortable with inches/cm.

7. **Transfer mode comparison** — The A/B frame workflow could be designed as a side-by-side comparison rather than two sequential sections.
