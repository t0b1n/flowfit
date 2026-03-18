from __future__ import annotations

from .models import AngleBand, PosePreset


ENDURANCE = PosePreset(
    name="Endurance",
    trunk_angle=AngleBand(min_deg=50.0, max_deg=60.0, weight=1.0),
    hip_angle=AngleBand(min_deg=95.0, max_deg=105.0, weight=1.0),
    shoulder_flexion=AngleBand(min_deg=70.0, max_deg=90.0, weight=1.0),
    elbow_flexion=AngleBand(min_deg=10.0, max_deg=25.0, weight=0.5),
    knee_extension=AngleBand(min_deg=140.0, max_deg=150.0, weight=1.0),
)


REGULAR = PosePreset(
    name="Regular",
    trunk_angle=AngleBand(min_deg=40.0, max_deg=50.0, weight=1.0),
    hip_angle=AngleBand(min_deg=90.0, max_deg=100.0, weight=1.0),
    shoulder_flexion=AngleBand(min_deg=80.0, max_deg=100.0, weight=1.0),
    elbow_flexion=AngleBand(min_deg=15.0, max_deg=35.0, weight=0.5),
    knee_extension=AngleBand(min_deg=140.0, max_deg=150.0, weight=1.0),
)


FAST = PosePreset(
    name="Fast",
    trunk_angle=AngleBand(min_deg=30.0, max_deg=40.0, weight=1.0),
    hip_angle=AngleBand(min_deg=85.0, max_deg=95.0, weight=1.0),
    shoulder_flexion=AngleBand(min_deg=90.0, max_deg=110.0, weight=1.0),
    elbow_flexion=AngleBand(min_deg=20.0, max_deg=45.0, weight=0.5),
    knee_extension=AngleBand(min_deg=140.0, max_deg=150.0, weight=1.0),
)


PRESETS = {
    ENDURANCE.name: ENDURANCE,
    REGULAR.name: REGULAR,
    FAST.name: FAST,
}

