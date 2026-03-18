from fastapi.testclient import TestClient

from bikegeo_api.main import app
from bikegeo_core import (
    Components,
    ContactPoint,
    ContactPoints,
    FrameGeometry,
    RiderAnthropometrics,
    SetupInput,
)
from bikegeo_core.presets import ENDURANCE

client = TestClient(app)


def _minimal_setup() -> SetupInput:
    frame = FrameGeometry(
        stack=550.0,
        reach=380.0,
        head_angle_deg=73.0,
        seat_angle_deg=73.0,
        bb_drop=70.0,
        chainstay_length=410.0,
        fork_length=370.0,
        fork_offset=45.0,
        wheel_radius=340.0,
    )
    components = Components(
        crank_length=172.5,
        cleat_setback=0.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=700.0,
        stem_length=100.0,
        stem_angle_deg=6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=-40.0,
        hood_reach_offset=20.0,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=None,
        stance_width=None,
    )
    target = ContactPoints(
        saddle=ContactPoint(x=0.0, y=700.0),
        hoods=ContactPoint(x=400.0, y=600.0),
        cleat=ContactPoint(x=0.0, y=-170.0),
    )
    rider = RiderAnthropometrics(
        height=1800.0,
        thigh_length=430.0,
        shank_length=430.0,
        torso_length=600.0,
        upper_arm_length=320.0,
        forearm_length=280.0,
        foot_length=270.0,
        shoulder_width=400.0,
        hip_width=None,
        stance_width=None,
        flexibility=1.0,
    )
    return SetupInput(
        frame=frame,
        components=components,
        target_contact_points=target,
        rider=rider,
        preset=ENDURANCE,
    )


def test_solve_endpoint_round_trip() -> None:
    setup = _minimal_setup()
    response = client.post("/solve", json={"setup": setup.model_dump()})
    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert data["result"]["frame"]["stack"] == setup.frame.stack
