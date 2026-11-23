"""One choice for every room at once: schedule, comfort, eco or frost protection.

Sets each room's own override (without end), so a room shows and ends it like one set on
the room itself. "schedule" clears the overrides again. Outdoor areas and rooms without
devices only measure and are left out.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..const import (
    ALL_ROOMS_COMFORT,
    ALL_ROOMS_ECO,
    ALL_ROOMS_FROST,
    ALL_ROOMS_SCHEDULE,
    DOMAIN,
    OVERRIDE_BOOST,
    OVERRIDE_ECO,
    OVERRIDE_FROST,
    is_override_active,
)
from .area_utils import rooms_with_area
from .schedule_utils import mask_override_band, override_preset_band

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_MODE_TO_OVERRIDE = {
    ALL_ROOMS_COMFORT: OVERRIDE_BOOST,
    ALL_ROOMS_ECO: OVERRIDE_ECO,
    ALL_ROOMS_FROST: OVERRIDE_FROST,
}
_OVERRIDE_TO_MODE = {v: k for k, v in _MODE_TO_OVERRIDE.items()}

_CLEARED = {"override_heat": None, "override_cool": None, "override_until": None, "override_type": None}


def controlled_rooms(hass: HomeAssistant, rooms: dict[str, dict]) -> dict[str, dict]:
    """Rooms the all-rooms choice applies to: existing area, devices, not outdoor."""
    return {
        area_id: room
        for area_id, room in rooms_with_area(hass, rooms).items()
        if (room.get("devices") or room.get("thermostats") or room.get("acs")) and not room.get("is_outdoor", False)
    }


def all_rooms_mode(hass: HomeAssistant, rooms: dict[str, dict]) -> str | None:
    """The choice every controlled room is on, None when they differ (or there are none)."""
    modes: set[str | None] = set()
    for room in controlled_rooms(hass, rooms).values():
        if not is_override_active(room):
            modes.add(ALL_ROOMS_SCHEDULE)
        elif room.get("override_until") is None:
            modes.add(_OVERRIDE_TO_MODE.get(room.get("override_type") or ""))
        else:
            # A timed override is the room's own, not the all-rooms choice
            modes.add(None)
    return modes.pop() if len(modes) == 1 else None


async def async_set_all_rooms(hass: HomeAssistant, mode: str) -> int:
    """Put every controlled room on *mode*; returns how many rooms were changed."""
    store = hass.data[DOMAIN]["store"]
    settings = store.get_settings()
    override_type = _MODE_TO_OVERRIDE.get(mode)
    if override_type is None and mode != ALL_ROOMS_SCHEDULE:
        raise ValueError(f"unknown all-rooms mode {mode!r}")

    changed: list[str] = []
    for area_id, room in controlled_rooms(hass, store.get_rooms()).items():
        if override_type is None:
            if all(room.get(key) is None for key in _CLEARED):
                continue
            update = dict(_CLEARED)
        else:
            heat, cool = override_preset_band(room, override_type, settings)
            heat, cool = mask_override_band(heat, cool, room.get("climate_mode", "auto"))
            update = {
                "override_heat": heat,
                "override_cool": cool,
                "override_until": None,
                "override_type": override_type,
            }
        await store.async_update_room(area_id, update)
        changed.append(area_id)

    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if coordinator is not None and changed:
        for area_id in changed:
            coordinator.clear_override_seed(area_id)
        await coordinator.async_request_refresh()
    return len(changed)
