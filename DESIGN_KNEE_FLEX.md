# How Knee Flex Works

The rider's knee bend is controlled by two pipelines — one for the **2D side view** (runs entirely in the browser) and one for the **3D view** (calls the Python backend). Both should produce the same knee position.

---

## 2D Side View Pipeline

```mermaid
flowchart TD
    subgraph "What the rider sets"
        KF["Target knee flex angle"]
        IN["Inseam length"]
        PS["Pedal stack height"]
        SS["Saddle stack height"]
        SA["Seat tube angle\n(from the frame)"]
        TA["Riding posture preset\n(endurance / fast / race)"]
    end

    subgraph "Find the right saddle height"
        KF --> CONVERT["Convert flex to extension\n(e.g. 25 deg flex = 155 deg extension)"]
        CONVERT --> SEARCH["Search for the saddle height\nthat gives exactly that knee angle"]
        IN --> LEGS["Calculate leg segment lengths\nfrom inseam"]
        LEGS --> SEARCH
        SA --> SEARCH
        PS --> SEARCH
        SS --> SEARCH

        SEARCH --> IDEAL["Ideal saddle position found"]
    end

    subgraph "Move the saddle"
        IDEAL --> SEATPOST["Set the seatpost length\nso the saddle sits at the ideal height"]
        SEATPOST --> REBUILD["Rebuild the full bike\nwith the new saddle position"]
    end

    subgraph "Pose the mannequin"
        REBUILD --> PLACE["Place the hip at the saddle\n+ 95mm offset (where the\nfemur actually pivots)"]
        PLACE --> BEND["Bend the knee using\ntwo-circle intersection\n(thigh length + shin length)"]
        TA --> TORSO["Set the trunk angle\nfrom the posture preset"]
        TORSO --> ARMS["Position shoulders, elbows,\nand hands reaching to the hoods"]
    end

    subgraph "Show the result"
        BEND --> MEASURE["Measure the actual knee angle\nand display it"]
        MEASURE --> DISPLAY["Displayed knee flex\nshould match the target"]
    end
```

### How the knee search works

The system uses a **bisection search** — it tries different saddle heights, each time:
1. Placing the hip joint 95mm above the trial saddle position
2. Solving where the knee must be (given thigh and shin lengths reaching to the ankle)
3. Measuring the resulting angle
4. Adjusting the saddle up or down until the angle matches the target

This runs 50 iterations and converges to sub-millimeter precision.

---

## 3D View Pipeline

```mermaid
flowchart TD
    subgraph "Start from the 2D result"
        IDEAL2["Ideal saddle height\n(from 2D pipeline above)"]
        COMP2["All component settings"]
        RIDER2["Rider body measurements"]
        FRAME2["Frame geometry"]
    end

    subgraph "Call the Python backend"
        IDEAL2 --> SEND["Send everything to the\nPython server"]
        COMP2 --> SEND
        RIDER2 --> SEND
        FRAME2 --> SEND
        SEND --> BACKEND["Python computes the full\nbike geometry + mannequin\nusing the same knee IK"]
        BACKEND --> RESPONSE["Returns 3D points\nfor the frame tubes"]
    end

    subgraph "Build the 3D mannequin in the browser"
        RESPONSE --> EXTRACT["Extract saddle, hoods, and\npedal positions from the\nbackend response"]
        EXTRACT --> RERUN["Re-run the same 2D mannequin\nmath using backend positions"]
        RERUN --> SPLIT["Split each joint into\nleft and right sides\n(for the two legs, arms, etc.)"]
        SPLIT --> RENDER["Render as 3D cylinders\nand spheres in Three.js"]
    end

    subgraph "Important detail"
        RESPONSE -.-> NOTE["The backend also computes\nmannequin points, but they\nare NOT used for the 3D body.\nOnly the frame tubes come\nfrom the backend."]
    end
```

### Why it re-runs the mannequin math

The 3D view rebuilds the mannequin in the browser (rather than using backend points) so it can apply the **same trunk angle and back bend** settings from the posture preset. This keeps the 2D and 3D mannequins visually identical.

---

## Key files

| What | Where |
|------|-------|
| Saddle height search | `web/src/geometry.ts` — `idealContactsFromRider()` |
| Auto-seatpost adjustment | `web/src/FitBuilderMode.tsx` — useEffect near line 297 |
| Bike geometry from components | `web/src/geometry.ts` — `synthesizeBike()` |
| Mannequin posing (2D) | `web/src/geometry.ts` — `buildMannequin()` |
| Knee angle measurement | `web/src/geometry.ts` — `angleAtPoint()` |
| 3D mannequin expansion | `web/src/geometry.ts` — `buildMannequin3DPoints()` |
| 3D rendering | `web/src/BikeScene3D.tsx` |
| Backend mannequin solver | `bikegeo_core/mannequin2d.py` |
| Backend 3D expansion | `bikegeo_core/mannequin3d.py` |

---

## The rule both pipelines must follow

The femur pivots at the **hip joint center**, which is ~95mm above the saddle surface (where the sit bones rest). Every calculation that positions the knee — whether it's the saddle height search, the mannequin IK, or the angle measurement — must use this hip joint position, not the saddle surface.
