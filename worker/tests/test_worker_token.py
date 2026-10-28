import pytest
from fastapi import HTTPException

from server import require_worker_token


def test_open_when_no_token_configured(monkeypatch):
    monkeypatch.delenv("SLICER_WORKER_TOKEN", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
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


def test_hosted_without_token_fails_closed(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.delenv("SLICER_WORKER_TOKEN", raising=False)
    with pytest.raises(HTTPException) as err:
        require_worker_token(None)
    assert err.value.status_code == 503


def test_hosted_service_id_without_token_fails_closed(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("RENDER_SERVICE_ID", "srv-test")
    monkeypatch.setenv("SLICER_WORKER_TOKEN", "   ")
    with pytest.raises(HTTPException) as err:
        require_worker_token("   ")
    assert err.value.status_code == 503


def test_wrong_length_does_not_raise(monkeypatch):
    monkeypatch.setenv("SLICER_WORKER_TOKEN", "s3cret")
    with pytest.raises(HTTPException) as err:
        require_worker_token("s3cret-but-a-much-longer-value")
    assert err.value.status_code == 401


def test_slice_route_carries_the_gate():
    from server import app

    route = next(r for r in app.routes if getattr(r, "path", "") == "/slice")
    names = [d.call.__name__ for d in route.dependant.dependencies]
    assert "require_worker_token" in names


def test_health_route_stays_open():
    from server import app

    route = next(r for r in app.routes if getattr(r, "path", "") == "/health")
    names = [d.call.__name__ for d in getattr(route, "dependant").dependencies]
    assert "require_worker_token" not in names
