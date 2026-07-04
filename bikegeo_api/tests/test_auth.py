from __future__ import annotations

import time

from bikegeo_api.security import SESSION_COOKIE_NAME


def test_register_login_me_logout_flow(client):
    r = client.post("/auth/register", json={"email": "a@example.com", "password": "password12"})
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "a@example.com"
    assert "id" in body
    assert SESSION_COOKIE_NAME in r.cookies

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"

    r2 = client.post("/auth/logout")
    assert r2.status_code == 204

    client.cookies.clear()
    me2 = client.get("/auth/me")
    assert me2.status_code == 401

    r3 = client.post("/auth/login", json={"email": "a@example.com", "password": "password12"})
    assert r3.status_code == 200
    assert SESSION_COOKIE_NAME in r3.cookies


def test_register_duplicate_email(client):
    client.post("/auth/register", json={"email": "a@example.com", "password": "password12"})
    client.cookies.clear()
    r = client.post("/auth/register", json={"email": "a@example.com", "password": "password12"})
    assert r.status_code == 409


def test_login_wrong_password_and_no_user_identical_response(client):
    client.post("/auth/register", json={"email": "a@example.com", "password": "password12"})
    client.cookies.clear()

    r1 = client.post("/auth/login", json={"email": "a@example.com", "password": "wrongpassword"})
    r2 = client.post("/auth/login", json={"email": "ghost@example.com", "password": "wrongpassword"})

    assert r1.status_code == 401
    assert r2.status_code == 401
    assert r1.json() == r2.json()


def test_password_too_short(client):
    r = client.post("/auth/register", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422


def test_email_invalid(client):
    r = client.post("/auth/register", json={"email": "notanemail", "password": "password12"})
    assert r.status_code == 422


def test_extra_fields_rejected(client):
    r = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "password12", "tier": "premium"},
    )
    assert r.status_code == 422


def test_login_timing_does_not_leak_existence(client):
    """Best-effort timing check — both branches run argon2 verify."""
    client.post("/auth/register", json={"email": "a@example.com", "password": "password12"})
    client.cookies.clear()

    samples_existing = []
    samples_missing = []
    for _ in range(3):
        t = time.perf_counter()
        client.post("/auth/login", json={"email": "a@example.com", "password": "wrongpassword"})
        samples_existing.append(time.perf_counter() - t)
        t = time.perf_counter()
        client.post("/auth/login", json={"email": "ghost@example.com", "password": "wrongpassword"})
        samples_missing.append(time.perf_counter() - t)

    avg_existing = sum(samples_existing) / len(samples_existing)
    avg_missing = sum(samples_missing) / len(samples_missing)
    # Both branches should be in the same order of magnitude (within 4x).
    ratio = max(avg_existing, avg_missing) / max(min(avg_existing, avg_missing), 1e-6)
    assert ratio < 4.0, (avg_existing, avg_missing)
