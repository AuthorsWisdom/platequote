import pytest
from fastapi import HTTPException

from server import require_worker_token


def test_open_when_no_token_configured(monkeypatch):
    monkeypatch.delenv("SLICER_WORKER_TOKEN", raising=False)
    assert require_worker_token(None) is None
    assert require_worker_token("anything") is None


def test_rejects_missing_header(monkeypatch):
    monkeypatch.setenv("SLICER_WORKER_TOKEN", "s3cret")
    with pytest.raises(HTTPException) as err:
        require_worker_token(None)
    assert err.value.status_code == 401


def test_rejects_wrong_header(monkeypatch):
    monkeypatch.setenv("SLICER_WORKER_TOKEN", "s3cret")
    with pytest.raises(HTTPException) as err:
        require_worker_token("s3cret-but-wrong")
    assert err.value.status_code == 401


def test_accepts_matching_header(monkeypatch):
    monkeypatch.setenv("SLICER_WORKER_TOKEN", "s3cret")
    assert require_worker_token("s3cret") is None


def test_slice_route_carries_the_gate():
    from server import app

    route = next(r for r in app.routes if getattr(r, "path", "") == "/slice")
    names = [d.call.__name__ for d in route.dependant.dependencies]
    assert "require_worker_token" in names
