from app.core.spatial_engine import CatchmentIndex


def test_demo_stations_are_inside_the_catchment() -> None:
    index = CatchmentIndex()
    # Bandra Kurla Complex, a real point along the Mithi corridor.
    match = index.locate(latitude=19.0669, longitude=72.8679)
    assert match.matched is True
    assert match.catchment_id == "mithi-river-mumbai"


def test_far_away_point_is_outside_the_catchment() -> None:
    index = CatchmentIndex()
    # Downtown Delhi -- nowhere near the Mithi River corridor in Mumbai.
    match = index.locate(latitude=28.6139, longitude=77.2090)
    assert match.matched is False
    assert match.catchment_id is None


def test_catchment_ids_lists_the_demo_catchment() -> None:
    index = CatchmentIndex()
    assert "mithi-river-mumbai" in index.catchment_ids()
