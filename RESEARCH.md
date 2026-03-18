# bikegeo: Competitive Analysis & User Pain Points Research

_Last updated: 2026-03-17_

---

## 1. XY Bike Calc — Feature Inventory

[xybikecalc.com](https://www.xybikecalc.com) is a geometry-first bike fit tool. Its conceptual model is a **BB-centred Cartesian coordinate system**: every position is expressed as (X, Y) millimetres from the bottom bracket.

| Feature | Description |
|---|---|
| X/Y Position Calculator | Compute saddle (SX/SY) and handlebar (HX/HY) positions on any bike given stem + spacer config |
| Bike Position Simulator | Full simulator combining handlebar, saddle, and seatpost in one view |
| Stack & Reach Calculator | Convert handlebar coordinates into frame stack/reach values |
| Seatpost Calculator | Required seatpost setback and length, including integrated seat mast compatibility |
| Stem Calculator | Compare different stem lengths, angles, and spacer heights |
| Bike Search | Filter a database by desired stack/reach values |
| Fit Transfer workflow | Input a target position (from a fit bike or current bike) → see what stem/spacer/seatpost replicates it on another frame |
| PDF report generation | **Pro only** — shareable reports for coaches/fitters |
| Cloud save | **Pro only** — save bike profiles across sessions |
| Dark/light theme, mobile-responsive | UI polish |

**What XY Bike Calc does NOT do:**
- No body measurements or anthropometrics
- No mannequin / rider visualisation
- No joint angle analysis (knee extension, trunk, hip, shoulder, elbow)
- No posture presets or posture-band constraint checking
- No IK-based rider model
- No "ideal position from body dimensions" derivation
- No injury or comfort warnings based on rider posture

---

## 2. bikegeo — Current Feature Set

| Feature | Status |
|---|---|
| 2D SVG bike visualisation with mannequin overlay | ✅ |
| Inverse kinematics (2-link IK for knee + elbow) | ✅ |
| Joint angle calculation (trunk, hip, knee, shoulder, elbow) | ✅ |
| Posture presets (Endurance / Regular / Fast) | ✅ |
| Fit Builder: body measurements → ideal contact points | ✅ |
| Fit Transfer: Frame A contacts → Frame B component solver | ✅ |
| Fit warnings (contact point deltas in mm, colour-coded) | ✅ |
| Constraint violation reporting | ✅ |
| Frame catalog (6 models × 3 sizes) | ✅ |
| URL-encoded shareable setups | ✅ |
| Stem length axis in solver (±20mm) | ✅ |
| Hood/pedal presets (Shimano DA, SRAM Red/Force, etc.) | ✅ |

### bikegeo gaps vs XY Bike Calc

| XY Bike Calc capability | bikegeo status |
|---|---|
| Large, searchable bike database (filter by stack/reach) | Only 6 models, no search |
| PDF / printable report | Not implemented |
| Explicit BB-centred coordinate readout (SX/SY/HX/HY) in the UI | Not surfaced |
| Integrated seatpost / seat mast compatibility check | Not modelled |
| Cloud save / user accounts | Not implemented |

---

## 3. bikegeo Advantages Over XY Bike Calc

bikegeo is fundamentally ahead in the areas that matter most for accurate fitting:

1. **Body-driven fitting** — XY Bike Calc is purely geometry. bikegeo starts from rider anthropometrics and derives what position the human actually needs. This is the correct order of operations for a bike fit.
2. **Visual mannequin** — Seeing a stick-figure rider on the frame is immediately more intuitive than raw millimetre coordinates.
3. **Joint angle analysis** — bikegeo knows whether knee extension is 143° or 155°. XY Bike Calc has zero concept of the rider's body.
4. **Posture constraints** — If a position is biomechanically problematic, bikegeo flags it with specific violations.
5. **Fit Builder mode** — Entirely absent from XY Bike Calc. Deriving ideal contact points from body measurements is unique.
6. **Completely free** — XY Bike Calc gates PDF export and cloud save behind a Pro subscription.

### Competitive landscape summary

| Tool | Body-based | Mannequin | Joint angles | Fit transfer | Bike DB | PDF export | Free |
|---|---|---|---|---|---|---|---|
| **bikegeo** | ✅ | ✅ | ✅ | ✅ | Small | ❌ | ✅ |
| **XY Bike Calc** | ❌ | ❌ | ❌ | ✅ | Large | Pro only | Partial |
| **MyVeloFit** | Video AI | Video AI | Video AI | ❌ | ❌ | ✅ | Paid |
| **BikeInsights** | ❌ | ❌ | ❌ | ❌ | Large | ❌ | ✅ |
| **Bike Geometry Calc** | ❌ | ❌ | ❌ | ❌ | Manual | ❌ | ✅ |
| **FitKit Studio** | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | Paid (pro) |

**bikegeo is the only free tool that combines body measurements, visual mannequin, joint angle analysis, and fit transfer.**

---

## 4. User Pain Points

Sourced from: TrainerRoad Bike Fitting Mega-Thread (~2033 pages), web search across cycling forums, and app review analysis.

### 4.1 Conflicting & Confusing Advice

- Receiving two professional bike fits with contradictory recommendations — no way to adjudicate between them
- Not understanding *why* a fitter made a change, so cannot apply the logic independently
- YouTube and forum overload: too much contradictory information ("Progressive Road Position Isn't Faster for Most Riders" vs aggressive position advocates)
- General lack of structured, accessible guidance — most people learn through trial and error

### 4.2 Saddle Height — Persistent Confusion

- **Counterintuitive interactions**: one user lowered saddle 8mm and knee angle *increased* to 38–44°, above the recommended 25–35° — they couldn't understand why
- Debate over "too high vs too low" — most people don't know which side of optimal they're on and don't know the consequences of each
- Changing crank length changes optimal saddle height — no consumer tool walks users through this
- Multiple measurement methodologies (inseam ×0.883, LeMond method, angle-based) give different results

### 4.3 Saddle Fore-Aft & KOPS

- KOPS (Knee Over Pedal Spindle) is taught as gospel but doesn't apply universally across bike types or rider styles
- Confusion about saddle setback vs seat tube angle vs actual rider position over the pedals
- Users can't tell if they should move saddle forward/back without knowing how it affects the whole chain

### 4.4 Physical Discomfort with No Clear Cause

| Symptom | Likely cause — but users don't know this |
|---|---|
| Perineal abrasion (one-sided) | Saddle tilt, fore-aft position, or asymmetry/leg length discrepancy |
| Knee pain (anterior/posterior) | Saddle too low/high respectively |
| Lower back soreness | Too much reach, excessive pelvic rotation, weak core — hard to distinguish |
| Numb hands | Excess weight on bars; unclear if fix is raise bars or move saddle back |
| Neck strain | Position too low; looking up excessively |
| Calf / Achilles tension | Saddle height symptom |

Lower back soreness is by far the most common complaint — and the hardest to diagnose without understanding the full chain of cause.

### 4.5 Asymmetry & Biomechanical Individuality

- One-sided discomfort strongly suggests leg length discrepancy, but users don't know this and no consumer tool diagnoses it
- Varus/valgus wedging: approximately 85% of cyclists reportedly need varus wedges, but most never investigate foot alignment
- Q-factor / stance width almost never addressed in tools
- Individual anatomy (hip structure, femur angle, flexibility) not accounted for by generic algorithms

### 4.6 Fit Transfer Between Bikes

- Getting the same *feel* on a new frame is described as frustrating trial and error
- Crank length differences, seat tube angles, and different stack heights all interact and compound confusion
- Time trial bikes require entirely different fitting logic vs road bikes
- Multi-bike households (road + trainer + TT) each need separate consideration

### 4.7 Frame Size Selection

- Manufacturer sizing charts frequently don't match comfort — many riders end up on the "wrong" size by spec and feel better on smaller
- TT bikes especially: riders often need a smaller frame than road because of the position
- Stack/reach comparison is not intuitive for non-technical cyclists
- Users find a comfortable fit first, then struggle to find a new frame that replicates it

### 4.8 Indoor vs Outdoor Positioning

- Trainer-specific positioning: static trainer vs outdoor motion feels different; some users want slightly different saddle height
- No consumer tools distinguish indoor from outdoor fitting requirements
- Trainer riser blocks help but their effect on effective saddle height is not calculated

### 4.9 Cleat & Foot Positioning

- **Most apps and calculators completely ignore cleat position** — a major gap
- Ball-of-foot vs mid-foot placement changes effective crank length and thus optimal saddle height
- Varus/valgus wedging under the foot
- Cleat rotation, float, and fore-aft placement all affect knee tracking
- Specialized Body Geometry wedges referenced as one solution, but users don't know how to choose

### 4.10 App & Algorithm Limitations (General)

- Measurement difficulty: getting accurate video angles at home is genuinely hard
- Some apps don't accept decimal inputs, forcing rounding on critical measurements
- One-size-fits-all algorithms miss individual anatomy entirely
- Apps only give numbers — no explanation of what they mean or what to change
- None address bar width, Q-factor, or 3D rider positioning

---

## 5. Differentiation Opportunities

Prioritised by impact and development tractability.

### Tier 1 — High impact, directly buildable on existing architecture

**A. Symptom-to-cause diagnostic mode**
Users know their symptom but not the cause. A "what hurts?" guided flow that maps symptoms to specific adjustments (e.g. "anterior knee pain → saddle probably too low → try +5mm") would be uniquely valuable. No current tool offers this.

**B. Crank length effect on saddle height**
Changing crank length (e.g. 175mm → 170mm) requires a saddle height increase of ~half the crank delta. This is well-understood by professional fitters but completely absent from consumer tools. bikegeo's solver is perfectly positioned to model this.

**C. Posture explanation layer**
Don't just display joint angles — explain *why* a position is good or risky: "Knee extension at 155° may strain the patella tendon. Try raising the saddle 5–8mm." This turns a number into actionable guidance.

**D. Free PDF / print report**
XY Bike Calc charges a Pro subscription for PDF export. bikegeo's URL-encoding mechanism is almost there — a print stylesheet or `window.print()` triggered export could offer this for free, as a clear differentiator. Useful for sharing with coaches or fitters.

**E. Expanded bike database, searchable by stack/reach**
Currently only 6 models. A searchable database where users filter frames by their ideal stack/reach target would be extremely useful. XY Bike Calc provides this behind a paywall — bikegeo could offer it free.

### Tier 2 — Medium impact

**F. Cleat position modelling**
Ball-of-foot vs mid-foot placement changes effective crank length. Model it — competitors don't. Even a simple toggle that adjusts saddle height recommendation accordingly would be a genuine first.

**G. Indoor / outdoor mode**
Small but appreciated: an option that suggests a +3–5mm saddle height for trainer use (accounting for static platform vs outdoor motion).

**H. "How aggressive can I go?" flexibility assessment**
Based on hip flexion / hamstring flexibility input, predict the minimum trunk angle the rider can comfortably sustain. Help users understand their current flexibility ceiling before chasing more aggressive positions.

**I. Leg length discrepancy / asymmetry flag**
If user inputs different left/right leg lengths, model the effect on knee tracking and suggest cleat shimming depth. One-sided pain is a very common complaint; this would be a genuine differentiator.

**J. Progressive position planner**
"You want to get to a 38° trunk angle but are currently at 52°. Here's a 3-stage plan over 6 months — each stage reduces trunk angle by 4–5° as flexibility improves."

### Tier 3 — Longer term

**K. Varus/valgus wedge recommendation**
Based on knee tracking symptoms or foot angle input, recommend wedge type and thickness.

**L. TT / triathlon mode**
Different joint angle targets (hip angle in aero tuck differs significantly), different geometry inputs (pad stack, pad reach, arm pad width).

**M. Power optimisation mode**
Trade-off slider between comfort-optimised and power-optimised position; show how moving aggressive changes estimated power output based on biomechanical models.

---

## 6. Summary

bikegeo's core proposition — body-first, biomechanically-aware bike fitting — is architecturally superior to XY Bike Calc's geometry-only approach. The gaps to close are:

1. **Explainability**: tell users *why* not just *what*
2. **Diagnostics**: start from symptoms, not measurements
3. **Database breadth**: more frames, searchable
4. **Output artifacts**: PDF/print report
5. **Undiscovered territory**: cleat modelling, asymmetry, indoor/outdoor — areas no competitor currently addresses
