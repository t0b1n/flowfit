from __future__ import annotations

import json

import pytest


def _valid_bike_payload(brand: str = "TestCo", model: str = "AeroOne", year: int = 2026) -> dict:
    return {
        "brand": brand,
        "model": model,
        "launch_year": year,
        "category": "road",
        "popularity": "low",
        "sources": ["https://example.com/spec"],
        "sizes": [
            {
                "size": "M",
                "geometry": {
                    "stack": 560,
                    "reach": 385,
                    "head_angle_deg": 73,
                    "seat_angle_deg": 73.5,
                    "bb_drop": 70,
                    "chainstay_length": 410,
                    "fork_length": 370,
                    "fork_offset": 45,
                    "wheel_radius": 340,
                },
            }
        ],
    }


def _register(client, email: str = "a@example.com", password: str = "password12") -> dict:
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_bike_requires_auth(client):
    r = client.post("/bikes", json=_valid_bike_payload())
    assert r.status_code == 401


def test_create_and_list_bikes_public(client):
    _register(client)
    r = client.post("/bikes", json=_valid_bike_payload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"].startswith("user-")
    assert body["brand"] == "TestCo"
    assert body["sizes"][0]["geometry"]["stack"] == 560

    client.cookies.clear()
    r2 = client.get("/bikes")
    assert r2.status_code == 200
    bikes = r2.json()["bikes"]
    assert len(bikes) == 1
    assert bikes[0]["brand"] == "TestCo"


def test_brands_endpoint(client):
    _register(client)
    client.post("/bikes", json=_valid_bike_payload(brand="Alpha"))
    client.post("/bikes", json=_valid_bike_payload(brand="Beta", model="Other"))
    r = client.get("/bikes/brands")
    assert r.status_code == 200
    assert r.json()["brands"] == ["Alpha", "Beta"]


def test_duplicate_brand_model_year_rejected(client):
    _register(client)
    r1 = client.post("/bikes", json=_valid_bike_payload())
    assert r1.status_code == 201
    r2 = client.post("/bikes", json=_valid_bike_payload())
    assert r2.status_code == 409


def test_duplicate_case_insensitive(client):
    _register(client)
    client.post("/bikes", json=_valid_bike_payload(brand="TestCo", model="AeroOne"))
    r = client.post("/bikes", json=_valid_bike_payload(brand="testco", model="aeroone"))
    assert r.status_code == 409


def test_oversized_payload_rejected(client):
    _register(client)
    payload = _valid_bike_payload()
    payload["popularity"] = "x" * 200
    payload["category"] = "y" * 200
    payload["sources"] = ["https://example.com/" + ("a" * 100) for _ in range(10)]
    big = json.dumps(payload) + " " * (70 * 1024)
    r = client.post(
        "/bikes",
        data=big,
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413


def test_non_https_source_rejected(client):
    _register(client)
    payload = _valid_bike_payload()
    payload["sources"] = ["http://insecure.example.com/spec"]
    r = client.post("/bikes", json=payload)
    assert r.status_code == 422


def test_nan_inf_geometry_rejected(client):
    _register(client)
    payload = _valid_bike_payload()
    raw = json.dumps(payload).replace('"stack": 560', '"stack": NaN')
    r = client.post("/bikes", content=raw, headers={"Content-Type": "application/json"})
    assert r.status_code in (400, 422)


def test_path_traversal_in_id(client):
    _register(client)
    r = client.patch("/bikes/..%2F..%2Fetc%2Fpasswd", json=_valid_bike_payload())
    assert r.status_code in (404, 405)


def test_disallowed_chars_in_brand(client):
    _register(client)
    payload = _valid_bike_payload(brand="<script>alert(1)</script>")
    r = client.post("/bikes", json=payload)
    assert r.status_code == 422


def test_extra_fields_rejected(client):
    _register(client)
    payload = _valid_bike_payload()
    payload["malicious"] = "field"
    r = client.post("/bikes", json=payload)
    assert r.status_code == 422


def test_owner_only_patch_and_flag(client):
    _register(client, email="a@example.com")
    create = client.post("/bikes", json=_valid_bike_payload())
    bike_id = create.json()["id"]

    client.cookies.clear()
    _register(client, email="b@example.com")
    r = client.patch(f"/bikes/{bike_id}", json=_valid_bike_payload(model="OtherModel"))
    assert r.status_code == 403

    flag = client.post(f"/bikes/{bike_id}/flag", json={"reason": "spam content here please"})
    assert flag.status_code == 403


def test_flag_own_bike_then_disappears(client):
    _register(client)
    create = client.post("/bikes", json=_valid_bike_payload())
    bike_id = create.json()["id"]
    r = client.post(f"/bikes/{bike_id}/flag", json={"reason": "duplicate of older entry"})
    assert r.status_code == 200

    client.cookies.clear()
    listing = client.get("/bikes").json()["bikes"]
    assert listing == []


def test_flag_reason_too_short(client):
    _register(client)
    create = client.post("/bikes", json=_valid_bike_payload())
    bike_id = create.json()["id"]
    r = client.post(f"/bikes/{bike_id}/flag", json={"reason": "too short"})
    assert r.status_code == 422


def test_non_json_content_type_rejected(client):
    _register(client)
    r = client.post(
        "/bikes",
        data="brand=evil",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 415


def test_geometry_out_of_bounds(client):
    _register(client)
    payload = _valid_bike_payload()
    payload["sizes"][0]["geometry"]["stack"] = 50  # below min 200
    r = client.post("/bikes", json=payload)
    assert r.status_code == 422
