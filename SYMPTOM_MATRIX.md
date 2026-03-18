# Symptom-to-Cause Evidence Matrix
## Bikegeo Feature A: Diagnostic Mode Research Foundation

---

## 1. Evidence Overview

No single public dataset maps cycling pain symptoms to fit adjustments, and no published ML model exists that predicts fit parameters from symptom input. The closest published work (Bini & Corrêa de Queiroz Neto, Frontiers 2025) trains a KNN on **joint kinematics → saddle height** — the reverse direction from what Feature A requires. Certification bodies (IBFI, Specialized BG Fit, Retul, GURU) keep their diagnostic decision logic proprietary. The most rigorous systematic review in the field (Visentini et al., 2022) concludes there is *"no strong evidence relating any measure of the bike, body or load to cycling overuse pain or injury,"* meaning any diagnostic tool must be transparent about confidence levels. The right approach for bikegeo is a **hand-compiled curated evidence matrix** — bikegeo would be the first interactive tool to surface these associations with citations shown to the user, which is itself a differentiator.

---

## 2. Problem → Solution → Citation Matrix

| # | Symptom / Pain Location | Probable Cause (Fit Parameter) | Recommended Adjustment | Confidence | Primary Citation(s) |
|---|---|---|---|---|---|
| 1 | **Anterior knee pain** (front of knee, patellofemoral) | Saddle too low → excessive knee flexion at BDC; cranks too long | Raise saddle 5–10 mm; target 25–30° knee flexion at bottom dead centre | **Moderate** | Bini & Hume, *Sports Medicine* 41(6):463–476, 2011 (PMID 21615188); PMC5973630 |
| 2 | **Posterior knee pain** (behind knee, hamstring insertion) | Saddle too high → hamstring overstretch; excessive ankle drop | Lower saddle; check fore-aft position; cueing heel drop correction | **Moderate** | Bini & Hume, *Sports Medicine* 2011 (PMID 21615188); Holmes et al., *J Orthop Sports Phys Ther* 1994 |
| 3 | **Lateral knee pain** (ITB syndrome, outer knee) | Saddle too low or too far forward; wide Q-factor; cleat toe-in | Move saddle up/back; move cleat heel-in (toe-out) or wider float; consider shorter crank | **Moderate** | PMC7727429; PMC6818133; Bini & Hume 2011 |
| 4 | **Lower back pain** (lumbar) | Excessive reach (handlebar too far/low); flat lumbar flexion; saddle nose too high | Raise bars / reduce stem reach; anterior saddle tilt 3–7°; check hip flexor flexibility | **Moderate** | Streisfeld et al., *Cureus* 2017 (systematic review); ResearchGate LBP cycling review; PMC5973630 |
| 5 | **Hand numbness / ulnar neuropathy** (ring & little finger, hypothenar) | Too much weight on hands → handlebar too low / too far; poor bar rotation | Raise bars; shorten stem; rotate bars up; add bar tape; vary hand position | **Moderate** | PMC12349262; Patterson et al., *Br J Sports Med* 2003 |
| 6 | **Hip pain — lateral** (greater trochanter / TFL) | Saddle too high and/or rocking pelvis laterally; wide Q-factor | Lower saddle slightly; check cleat alignment; assess iliotibial and hip abductor strength | **Low–Moderate** | PMC7727429; expert opinion (Myers, *Lower Extremity Review*) |
| 7 | **Hip pain — anterior** (hip flexor, iliopsoas) | Saddle too high, excessive anterior pelvic tilt; or saddle too far back with excessive hip flexion at TDC | Adjust saddle height down slightly; check fore-aft; crank length reduction | **Low** | Expert opinion; Silberman 2005 review |
| 8 | **Neck / cervical strain** (upper trapezius, cervical extensors) | Handlebar too low → sustained neck hyperextension; stem too long | Raise bars; shorten stem or use upright stem; check saddle tilt (tilting nose down shifts weight forward) | **Low** | Streisfeld et al., *Cureus* 2017; expert consensus |
| 9 | **Perineal numbness / saddle pressure** (soft tissue / sit-bone) | Saddle nose too high → anterior rotation of pelvis onto nose; wrong saddle width; too little saddle setback | Tilt saddle nose 0–3° down; confirm saddle width matches ischial width; check fore-aft | **Moderate** | Schwarzer et al., *J Sexual Med* 2002; Gemperli et al., *Eur Urol* 2004; expert consensus |
| 10 | **Calf / Achilles tension** (posterior lower leg) | Excessive heel drop (ankle plantarflexion); saddle too high; cleat too far forward | Lower saddle slightly; move cleat back (closer to heel); assess ankle dorsiflexion mobility | **Low–Moderate** | Silberman 2005; expert opinion (Myers, *Lower Extremity Review*) |
| 11 | **Foot numbness / metatarsalgia** (forefoot, ball of foot) | Cleat too far forward (under metatarsal heads) → hot-foot; narrow shoes; tight toe box | Move cleat back 3–5 mm; consider wider shoes; check insole/arch support | **Low–Moderate** | Silberman 2005; expert opinion; anecdotal clinical literature |

### Confidence Key
- **High** — supported by ≥1 RCT or systematic review with direct evidence
- **Moderate** — supported by cross-sectional studies, case series, or consistent expert consensus in peer-reviewed commentary
- **Low** — expert opinion, case reports, or extrapolated from biomechanical first principles only

> **Important caveat:** No row in this table currently qualifies as **High** confidence by strict RCT standards. The Visentini et al. (2022) systematic review found no high-quality prospective evidence linking any fit parameter to overuse injury outcomes. "Moderate" here reflects consistent expert agreement and plausible biomechanical mechanism, not randomised trial data.

---

## 3. Diagnostic Flow

A text-format decision tree structured for UI implementation. Each node maps to a matrix row number above.

```
START: Where is the pain?
│
├── KNEE
│   ├── Front of knee (patellofemoral / anterior)
│   │   ├── Sub-Q: Both sides or one side?
│   │   │   ├── Both → likely saddle height (↑ raise) → Row 1
│   │   │   └── One side → also check cleat alignment / leg length difference → Row 1 + cleat
│   │   └── Re-assessment: Pain resolved within 2 rides? If not → consider crank length
│   │
│   ├── Back of knee (posterior / hamstring)
│   │   ├── Sub-Q: Pain worse at high cadence or big gear?
│   │   │   ├── High cadence → saddle likely too high → Row 2 (lower saddle)
│   │   │   └── Big gear / low cadence → possibly cleat fore-aft, hamstring tightness
│   │   └── Re-assessment: Did saddle lowering shift pain to front? → saddle was in correct range, reassess
│   │
│   └── Outside of knee (lateral / ITB)
│       ├── Sub-Q: Does pain worsen at specific cadence thresholds?
│       ├── Adjust: saddle height + cleat rotation (heel-in) → Row 3
│       └── Re-assessment: If unchanged after 3 rides → Q-factor / crank arm length
│
├── LOWER BACK / LUMBAR
│   ├── Sub-Q: Pain during ride or only after?
│   │   ├── During → positional / reach issue → Row 4 (raise bars, reduce reach)
│   │   └── After → may be core fatigue → Row 4 + off-bike strengthening recommendation
│   ├── Sub-Q: Saddle nose level? Tilted up?
│   │   └── If nose high → anterior tilt 3–7° → Row 4
│   └── Re-assessment: Check if hip flexor flexibility limits neutral pelvis
│
├── HANDS / WRISTS
│   ├── Sub-Q: Which fingers?
│   │   ├── Ring + little (ulnar) → handlebar height / reach → Row 5
│   │   └── Thumb + index (median / carpal tunnel) → wrist angle, bar rotation
│   ├── Adjust: Raise bars, shorten stem, rotate bars upward → Row 5
│   └── Re-assessment: Tingling during ride vs. after — persistent median symptoms → refer
│
├── HIP
│   ├── Sub-Q: Lateral hip (outside) or front of hip?
│   │   ├── Lateral → TFL / ITB origin → Row 6 (saddle height, cleat)
│   │   └── Front (hip flexor / groin) → Row 7 (saddle height, fore-aft, crank length)
│   └── Re-assessment: Hip rocking visible? → likely saddle too high
│
├── NECK / SHOULDERS
│   ├── Upper trap / neck extensors → Row 8 (raise bars, shorten stem)
│   └── Sub-Q: Does discomfort start early in ride? → fit issue. Late in ride? → fatigue / core
│
├── PERINEUM / SADDLE PRESSURE
│   ├── Sub-Q: Numbness or pain? Central or one-side?
│   │   ├── Central numbness → saddle nose tilt + width → Row 9
│   │   └── One-side → asymmetric pelvic position → check leg length + cleat
│   └── Re-assessment: Measure ischial width → confirm saddle width match
│
├── CALF / ACHILLES
│   ├── Sub-Q: Pain at top of pedal stroke or bottom?
│   │   ├── Top → hamstring / popliteal → see posterior knee
│   │   └── Bottom → plantarflexion, Achilles → Row 10 (lower saddle, cleat back)
│   └── Re-assessment: Assess ankle dorsiflexion range of motion off bike
│
└── FOOT / FOREFOOT
    ├── Sub-Q: Hot-foot (burning ball of foot) or general numbness?
    │   ├── Hot-foot → cleat too far forward → Row 11 (cleat back 3–5 mm)
    │   └── General numbness → shoe tightness, width → Row 11 + shoe assessment
    └── Re-assessment: Does pain shift location after cleat move? → confirms cleat cause
```

### UI Implementation Notes
- Each leaf node should surface: **adjustment**, **confidence level**, and **primary citation**
- Sub-questions should be yes/no or multiple-choice (avoid free-text input in v1)
- Re-assessment cues should link back to the same symptom after a configurable ride count (suggested: 3 rides)
- Flag any "refer" cases (persistent numbness, unilateral swelling, acute injury presentation) prominently

---

## 4. Sources

### Peer-Reviewed Papers

| Ref | Citation | Link |
|---|---|---|
| Bini & Hume 2011 | Bini RR, Hume PA. "Effects of saddle height on knee forces during cycling." *Sports Medicine* 41(6):463–476, 2011 | PMID: 21615188 |
| Visentini 2022 | Visentini PJ et al. "Bike fitting and overuse injuries in road cyclists." *Sports Medicine* 2022 (systematic review) | DOI via PubMed |
| Streisfeld 2017 | Streisfeld GM et al. "Relationship between body positioning, muscle activity, and spinal kinematics in cyclists with and without low back pain." *Cureus* 9(12):e1944, 2017 | PMC5973630 |
| PMC12349262 | Hand/ulnar neuropathy in cyclists — prospective cohort | PMC12349262 |
| PMC7727429 | ITB / lateral knee pain in cyclists | PMC7727429 |
| PMC6818133 | Cleat position and knee kinematics | PMC6818133 |
| Silberman 2005 | Silberman MR et al. "Road bicycle fit." *Clinical Journal of Sport Medicine* 15(4):271–276, 2005 | PMID 16003061 |
| Holmes 1994 | Holmes JC et al. "Cleat position because of knee overuse and injury in cycling." *Journal of Orthop Sports Phys Ther* 19(5):280–285, 1994 | PMID 8180981 |
| Schwarzer 2002 | Schwarzer U et al. "Cycling and penile oxygen pressure." *Journal of Sexual Medicine* 2002 | PMID 12472498 |

### Clinical Commentary / Expert Framework

| Ref | Source |
|---|---|
| Myers (LER) | Myers T. "Bike fitting for the physical therapist." *Lower Extremity Review Magazine*, UCSF PT/DPT. Provides symptom → parameter → adjustment framework; closest to a practitioner lookup table in open literature. |
| IBFI/Retul/Specialized BG Fit | Certification bodies — decision logic proprietary, not publicly available |

---

## 5. Gaps & Caveats

### Overall Evidence Quality
The Visentini et al. (2022) systematic review in *Sports Medicine* is the most rigorous synthesis available and its conclusion is stark: **no strong evidence** from prospective or randomised studies links any bike fit measurement to cycling overuse injury. This means the entire matrix above is built on cross-sectional studies, retrospective case series, and expert consensus. It should be presented to users with appropriate epistemic honesty.

### Row-Level Gaps

| Row | Gap |
|---|---|
| Anterior knee (1) | Quantitative saddle height targets (25–30° flexion) are well-cited but derived from cross-sectional optimal-performance studies, not injury-prevention RCTs |
| Posterior knee (2) | Same caveat as above; no prospective data |
| Lateral knee / ITB (3) | Q-factor and cleat evidence is particularly sparse; most cleat recommendations are extrapolated from gait biomechanics |
| Lower back (4) | Saddle tilt recommendations (3–7°) vary widely across sources; no consensus quantitative target |
| Hand numbness (5) | Moderate evidence for ulnar nerve compression mechanism; less clear which fit variable is primary driver |
| Hip pain (6, 7) | Expert opinion only; no prospective cohort data |
| Neck/cervical (8) | No dedicated cycling neck pain RCTs found; extrapolated from general ergonomics literature |
| Perineal numbness (9) | Saddle design (cutout vs. noseless) is better-evidenced than fit adjustments specifically |
| Calf / Achilles (10) | Expert opinion; no peer-reviewed cycling-specific data found |
| Foot numbness (11) | Anecdotal and clinical case literature only |

### Asymmetry / One-Sided Symptoms
All rows assume bilateral symmetric symptoms. Unilateral symptoms may indicate leg length discrepancy, asymmetric cleat placement, asymmetric hip anatomy, or single-leg overuse patterns. No peer-reviewed dataset addresses unilateral cycling symptom management — this is entirely expert opinion territory.

### Dosage Uncertainty
Quantitative adjustment amounts (e.g., "raise saddle 5–10 mm") are rarely derived from dose-response studies. They represent clinical ranges from expert commentary and case series. The bikegeo UI should present these as starting ranges, not precise prescriptions, and prompt re-assessment after adjustment.

### Implementation Recommendation
Present confidence levels inline with each recommendation. Label "Low" confidence rows clearly as "based on expert consensus, not trial data." This distinguishes bikegeo from less rigorous generic advice and builds user trust through transparency.
