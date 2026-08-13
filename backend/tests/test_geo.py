"""Tests for the heading helpers (US-2.03).

Pure trigonometry, so nothing is stubbed. The cases that matter are the ones
that decide what the rider hears: which way is "right", and the stationary case
where a bearing would be nothing but GPS noise.

Coordinates here are public landmarks, never real test locations (CLAUDE.md).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from lib.geo import (  # noqa: E402
    MIN_DISTANCE_METERS,
    bearing_to_compass,
    calculate_bearing,
    haversine_distance,
    relative_direction,
)

# Tokyo Station, used as the origin throughout.
TOKYO_STATION = {"latitude": 35.6812, "longitude": 139.7671}


def _offset(point, *, north=0.0, east=0.0):
    """Shift a point by roughly the given metres. Fine at these latitudes."""
    return {
        "latitude": point["latitude"] + north / 111_000,
        "longitude": point["longitude"] + east / (111_000 * 0.813),
    }


@pytest.mark.parametrize(
    "north, east, expected",
    [
        (100, 0, 0),  # due north
        (0, 100, 90),  # due east
        (-100, 0, 180),  # due south
        (0, -100, 270),  # due west
    ],
)
def test_cardinal_bearings(north, east, expected):
    bearing = calculate_bearing(TOKYO_STATION, _offset(TOKYO_STATION, north=north, east=east))
    # Within a degree: the flat-earth offset above is an approximation.
    assert min(abs(bearing - expected), 360 - abs(bearing - expected)) < 1.0


def test_bearing_is_never_negative():
    # atan2 returns negative angles for westward travel; the caller expects
    # [0, 360) so that the compass lookup cannot index out of range.
    bearing = calculate_bearing(TOKYO_STATION, _offset(TOKYO_STATION, north=100, east=-100))
    assert 0 <= bearing < 360


@pytest.mark.parametrize(
    "degrees, expected",
    [
        (0, "北"),
        (45, "北東"),
        (90, "東"),
        (180, "南"),
        (270, "西"),
        (359, "北"),  # wraps back round rather than overflowing
        (348.75, "北"),  # exactly on the boundary of the north sector
    ],
)
def test_compass_labels(degrees, expected):
    assert bearing_to_compass(degrees) == expected


def test_right_hand_is_ninety_degrees_clockwise():
    # The core of "what is that mountain on my right?" - heading north means
    # the right-hand side faces east.
    assert relative_direction(0, 90) == "東"
    assert relative_direction(0, -90) == "西"


def test_relative_direction_wraps_past_north():
    # Heading north-west, the right-hand side is north-east: the +90 crosses 0.
    assert relative_direction(315, 90) == "北東"
    assert relative_direction(45, -90) == "北西"


def test_distance_between_identical_points_is_zero():
    assert haversine_distance(TOKYO_STATION, TOKYO_STATION) == pytest.approx(0.0)


def test_distance_is_symmetric_and_roughly_correct():
    moved = _offset(TOKYO_STATION, north=1000)
    assert haversine_distance(TOKYO_STATION, moved) == pytest.approx(1000, rel=0.01)
    assert haversine_distance(moved, TOKYO_STATION) == pytest.approx(
        haversine_distance(TOKYO_STATION, moved)
    )


def test_stationary_rider_falls_under_the_threshold():
    # A metre of GPS jitter at a traffic light must not be read as travel.
    jitter = _offset(TOKYO_STATION, north=1)
    assert haversine_distance(TOKYO_STATION, jitter) < MIN_DISTANCE_METERS


def test_moving_rider_clears_the_threshold():
    moved = _offset(TOKYO_STATION, north=50)
    assert haversine_distance(TOKYO_STATION, moved) > MIN_DISTANCE_METERS
