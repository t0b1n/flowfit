from __future__ import annotations

import json

METRICS = {
    "knee_ext_bdc": 148.0,
    "knee_flex_tdc": 108.0,
    "hip": 96.5,
    "trunk": 52.0,
    "shoulder": 84.0,
    "elbow_flex": 18.0,
    "kops": 4.0,
    "saddle_height": 722.0,
    "setback": 60.0,
    "drop": 80.0,
    "reach": 560.0,
}


def _register(client, email: str = "a@example.com", password: str = "password12") -> dict:
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def _payload(name: str = "Fit 1 · Endurance", points: int = 25) -> dict:
    return {
        "name": name,
        "inputs": {"v": 1, "riderFit": {"height": 1760, "inseam": 860, "weight": 72, "targetKneeFlexDeg": 28}},
        "snapshot": {
            "metrics": dict(METRICS),
            "mannequin_points": [{"name": f"p{i}", "pos": [float(i), 2.0, -3.5]} for i in range(points)],
            "components": {"stem_length": 100.0, "spacer_stack": 20.0, "pedal_stack_height": None},
            "frame_label": "Specialized S-Works Crux 52",
        },
    }


def test_all_routes_require_auth(client):
    assert client.get("/fits").status_code == 401
    assert client.post("/fits", json=_payload()).status_code == 401
    assert client.get("/fits/abc").status_code == 401
    assert client.patch("/fits/abc", json={"name": "x"}).status_code == 401
    assert client.delete("/fits/abc").status_code == 401


def test_create_then_list_summary_has_no_inputs(client):
    _register(client)
    r = client.post("/fits", json=_payload())
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "Fit 1 · Endurance"
    assert created["inputs"]["v"] == 1
    assert len(created["snapshot"]["mannequin_points"]) == 25

    listing = client.get("/fits").json()["fits"]
    assert [f["id"] for f in listing] == [created["id"]]
    summary = listing[0]
    assert "inputs" not in summary and "snapshot" not in summary
    assert summary["metrics"]["knee_ext_bdc"] == 148.0
    assert summary["frame_label"] == "Specialized S-Works Crux 52"


def test_get_own_and_other_users_fit_is_404(client):
    _register(client, email="a@example.com")
    fit_id = client.post("/fits", json=_payload()).json()["id"]
    assert client.get(f"/fits/{fit_id}").status_code == 200

    client.cookies.clear()
    _register(client, email="b@example.com")
    assert client.get(f"/fits/{fit_id}").status_code == 404
    assert client.delete(f"/fits/{fit_id}").status_code == 404
    assert client.patch(f"/fits/{fit_id}", json={"name": "mine now"}).status_code == 404
    assert client.get("/fits").json()["fits"] == []


def test_rename_and_delete(client):
    _register(client)
    fit_id = client.post("/fits", json=_payload()).json()["id"]
    r = client.patch(f"/fits/{fit_id}", json={"name": "  Race fit  "})
    assert r.status_code == 200
    assert r.json()["name"] == "Race fit"

    assert client.delete(f"/fits/{fit_id}").status_code == 204
    assert client.get("/fits").json()["fits"] == []
    assert client.get(f"/fits/{fit_id}").status_code == 404


def test_validation(client):
    _register(client)
    assert client.post("/fits", json=_payload(name="   ")).status_code == 422
    assert client.post("/fits", json=_payload(name="x" * 121)).status_code == 422
    assert client.post("/fits", json=_payload(name="<b>hi</b>")).status_code == 422
    assert client.post("/fits", json=_payload(points=65)).status_code == 422
    assert client.post("/fits", json=_payload(points=64)).status_code == 201

    bad_metric = _payload()
    bad_metric["snapshot"]["metrics"]["not_a_metric"] = 1.0
    assert client.post("/fits", json=bad_metric).status_code == 422

    extra = _payload()
    extra["unexpected"] = True
    assert client.post("/fits", json=extra).status_code == 422


def test_newest_first(client):
    _register(client)
    r1 = client.post("/fits", json=_payload(name="first"))
    r2 = client.post("/fits", json=_payload(name="second"))
    assert r1.status_code == 201 and r2.status_code == 201, (r1.text, r2.text)
    first, second = r1.json()["id"], r2.json()["id"]
    assert [f["id"] for f in client.get("/fits").json()["fits"]] == [second, first]


def test_maximal_payload_fits_under_request_cap(client):
    """The request limit is 64 KB; a maximal valid snapshot must stay well under it."""
    _register(client)
    payload = _payload(points=64)
    payload["name"] = "n" * 120
    payload["snapshot"]["components"] = {f"component_{i:02d}_" + "k" * 30: float(i) for i in range(64)}
    payload["snapshot"]["frame_label"] = "f" * 200
    payload["inputs"] = {f"key{i}": {"values": list(range(20))} for i in range(40)}
    body = json.dumps(payload)
    assert len(body.encode()) < 32 * 1024
    r = client.post("/fits", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 201, r.text
