#!/usr/bin/env python3
"""Compare ways of turning a GPS coordinate into a Japanese address.

Exists because the deployed agent named a city about 40km from where the rider
actually was: the coordinates arrived intact, so the error was the model's own
reading of them. This measures the alternatives.

Two lookup sources are compared:
  - aws : Amazon Location Service geo-places reverse-geocode
  - gsi : the Geospatial Information Authority of Japan's public API

The sample points are public landmarks on purpose. Do not commit real
coordinates from a live device - where someone actually was is private, and
this directory is published.

Usage:
    eval "$(aws configure export-credentials --profile touring --format env)"
    python3 try_reverse_geocode.py            # run the built-in sample points
    python3 try_reverse_geocode.py 35.6812 139.7671
"""

import json
import math
import sys
import time
import urllib.request

import boto3

# geo-places is callable from Tokyo, which is where the Lambda runs, so adding
# the lookup there does not introduce another cross-region hop.
AWS_REGION = "ap-northeast-1"

GSI_URL = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress"

# lat, lon, label. Public landmarks only (see the module docstring). Chosen to
# cover a city, a mountain road, and open sea - the last being the case where
# every lookup fails and the caller needs a fallback.
SAMPLE_POINTS = [
    (35.6812, 139.7671, "東京駅"),
    (35.2323, 139.0230, "箱根・芦ノ湖畔（山が多い地点）"),
    (35.0, 139.0, "箱根付近"),
    (34.0658, 134.0, "徳島の山中"),
    (43.06, 141.35, "札幌"),
    (35.0, 141.5, "房総沖（海上・ヒットしない想定）"),
]


def by_aws(lat: float, lon: float) -> tuple[str, float]:
    """Reverse-geocode with Amazon Location Service."""
    client = _aws_client()
    started = time.monotonic()
    result = client.reverse_geocode(QueryPosition=[lon, lat], MaxResults=1)
    elapsed = (time.monotonic() - started) * 1000

    items = result.get("ResultItems") or []
    if not items:
        # Open sea and locations outside coverage land here; callers must cope.
        return "(no result)", elapsed

    address = items[0].get("Address", {})
    region = address.get("Region", {}).get("Name", "")
    locality = address.get("Locality", "")
    # Region + Locality is what belongs in a prompt; Label is often too
    # specific to read aloud (it can name an individual building).
    return f"{region} {locality}".strip() or address.get("Label", ""), elapsed


_client = None


def _aws_client():
    """Reuse one client so the timings exclude TLS setup."""
    global _client
    if _client is None:
        _client = boto3.client("geo-places", region_name=AWS_REGION)
        # Warm the connection; the first call otherwise includes the handshake.
        try:
            _client.reverse_geocode(QueryPosition=[139.7, 35.68], MaxResults=1)
        except Exception:  # noqa: BLE001 - warm-up only, real errors surface later
            pass
    return _client


def by_gsi(lat: float, lon: float) -> tuple[str, float]:
    """Reverse-geocode with the GSI public API.

    Returns a municipality code rather than a name, which is the reason this
    was not adopted: mapping ~1900 codes to prefecture/city is on the caller.
    """
    started = time.monotonic()
    try:
        with urllib.request.urlopen(
            f"{GSI_URL}?lat={lat}&lon={lon}", timeout=8
        ) as response:
            data = json.load(response)
        elapsed = (time.monotonic() - started) * 1000
        results = data["results"]
        return f"muniCd={results['muniCd']} {results['lv01Nm']}", elapsed
    except Exception as error:  # noqa: BLE001 - includes the open-sea case
        return f"(no result: {type(error).__name__})", (time.monotonic() - started) * 1000


def nearby_terrain(lat: float, lon: float, radius_m: int = 15000) -> None:
    """List nearby mountains and other terrain, with bearing and distance.

    Answers the "what's that mountain?" story (US-1.01). Note the category has
    to be given as an id; the display name "Natural and Geographical" is
    rejected. Without the filter, SearchNearby returns nearby *facilities*
    (ropeway stations, shops) and no mountains at all.
    """
    client = _aws_client()
    started = time.monotonic()
    result = client.search_nearby(
        QueryPosition=[lon, lat],
        QueryRadius=radius_m,
        Filter={"IncludeCategories": ["natural_and_geographical"]},
        MaxResults=10,
    )
    elapsed = (time.monotonic() - started) * 1000

    items = result.get("ResultItems") or []
    print(f"  周辺の自然地形: {len(items)}件  [{elapsed:.0f} ms]")
    for item in items:
        position = item.get("Position")
        if not position:
            continue
        # Each result carries its own position, so the direction can be
        # computed here rather than guessed by the model.
        direction = _compass(_bearing(lat, lon, position[1], position[0]))
        print(f"    {item.get('Title')}  {direction}  {item.get('Distance')}m")


_COMPASS = [
    "北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東",
    "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西",
]


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, in degrees clockwise from north."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta = math.radians(lon2 - lon1)
    y = math.sin(delta) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _compass(bearing: float) -> str:
    return _COMPASS[round(bearing / 22.5) % 16]


def main() -> None:
    if len(sys.argv) == 3:
        points = [(float(sys.argv[1]), float(sys.argv[2]), "指定された座標")]
    else:
        points = SAMPLE_POINTS

    for lat, lon, label in points:
        print(f"\n{label}  ({lat}, {lon})")
        for name, fn in (("aws", by_aws), ("gsi", by_gsi)):
            try:
                text, elapsed = fn(lat, lon)
                print(f"  {name}: {text}  [{elapsed:.0f} ms]")
            except Exception as error:  # noqa: BLE001 - keep comparing the rest
                print(f"  {name}: ERROR {type(error).__name__}: {error}")
        try:
            nearby_terrain(lat, lon)
        except Exception as error:  # noqa: BLE001
            print(f"  nearby: ERROR {type(error).__name__}: {error}")


if __name__ == "__main__":
    main()
