"""All rooms at once: schedule, comfort, eco or frost protection (select.roommind_all_rooms)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from custom_components.roommind.const import DOMAIN
from custom_components.roommind.select import RoomMindAllRoomsSelect
from custom_components.roommind.utils.all_rooms import all_rooms_mode, async_set_all_rooms
from custom_components.roommind.websocket_api import websocket_override_set_all

TRV = {"entity_id": "climate.trv", "type": "trv"}
AC = {"entity_id": "climate.ac", "type": "ac"}

_set_all = websocket_override_set_all.__wrapped__

pytestmark = pytest.mark.asyncio


def _room(**kw):
    return {
        "climate_mode": "auto",
        "devices": [TRV],
        "comfort_heat": 21.0,
        "comfort_cool": 24.0,
        "eco_heat": 17.0,
        "eco_cool": 27.0,
        **kw,
    }


@pytest.fixture(autouse=True)
def _all_areas_exist():
    with patch(
        "custom_components.roommind.utils.all_rooms.rooms_with_area",
        side_effect=lambda hass, rooms: dict(rooms),
    ):
        yield


@pytest_asyncio.fixture
async def env(hass, store):
    await store.async_load()
    coordinator = MagicMock()
    coordinator.async_request_refresh = AsyncMock()
    hass.data[DOMAIN] = {"store": store, "coordinator": coordinator}
    await store.async_save_room("living", _room())
    await store.async_save_room("bedroom", _room(climate_mode="heat_only"))
    await store.async_save_room("office", _room(climate_mode="cool_only", devices=[AC]))
    await store.async_save_room("garden", _room(is_outdoor=True))
    await store.async_save_room("hall", _room(devices=[]))
    return hass, store, coordinator


def _bands(store, *areas):
    return {
        a: (
            store.get_room(a)["override_type"],
            store.get_room(a)["override_heat"],
            store.get_room(a)["override_cool"],
            store.get_room(a)["override_until"],
        )
        for a in areas
    }


async def test_comfort_sets_each_rooms_comfort_band_without_end(env):
    hass, store, coordinator = env
    assert await async_set_all_rooms(hass, "comfort") == 3
    assert _bands(store, "living", "bedroom", "office") == {
        "living": ("boost", 21.0, 24.0, None),
        "bedroom": ("boost", 21.0, None, None),
        "office": ("boost", None, 24.0, None),
    }
    assert coordinator.clear_override_seed.call_count == 3
    coordinator.async_request_refresh.assert_awaited_once()


async def test_outdoor_and_deviceless_rooms_are_left_out(env):
    hass, store, _ = env
    await async_set_all_rooms(hass, "eco")
    assert store.get_room("garden").get("override_type") is None
    assert store.get_room("hall").get("override_type") is None


async def test_frost_heats_to_frost_temp_and_cools_at_eco(env):
    hass, store, _ = env
    await async_set_all_rooms(hass, "frost")
    assert _bands(store, "living", "office") == {
        "living": ("frost", 7.0, 27.0, None),
        "office": ("frost", None, 27.0, None),
    }


async def test_frost_uses_the_frost_temp_setting(env):
    hass, store, _ = env
    await store.async_save_settings({"frost_temp": 9.0})
    await async_set_all_rooms(hass, "frost")
    assert store.get_room("bedroom")["override_heat"] == 9.0


async def test_schedule_clears_overrides(env):
    hass, store, coordinator = env
    await async_set_all_rooms(hass, "eco")
    coordinator.async_request_refresh.reset_mock()
    assert await async_set_all_rooms(hass, "schedule") == 3
    assert {a: store.get_room(a)["override_type"] for a in ("living", "bedroom", "office")} == dict.fromkeys(
        ("living", "bedroom", "office")
    )
    coordinator.async_request_refresh.assert_awaited_once()


async def test_schedule_with_nothing_to_clear_changes_nothing(env):
    hass, _, coordinator = env
    assert await async_set_all_rooms(hass, "schedule") == 0
    coordinator.async_request_refresh.assert_not_awaited()


async def test_unknown_mode_raises(env):
    hass, _, _ = env
    with pytest.raises(ValueError):
        await async_set_all_rooms(hass, "off")


async def test_mode_is_the_common_choice(env):
    hass, store, _ = env
    assert all_rooms_mode(hass, store.get_rooms()) == "schedule"
    await async_set_all_rooms(hass, "frost")
    assert all_rooms_mode(hass, store.get_rooms()) == "frost"


async def test_mode_is_none_when_rooms_differ(env):
    hass, store, _ = env
    await async_set_all_rooms(hass, "eco")
    await store.async_update_room("living", {"override_type": "boost"})
    assert all_rooms_mode(hass, store.get_rooms()) is None


async def test_a_timed_override_is_not_an_all_rooms_choice(env):
    hass, store, _ = env
    await async_set_all_rooms(hass, "eco")
    await store.async_update_room("living", {"override_until": 9_999_999_999.0})
    assert all_rooms_mode(hass, store.get_rooms()) is None


async def test_mode_without_rooms_is_none(hass):
    assert all_rooms_mode(hass, {}) is None


async def test_websocket_set_all(env):
    hass, store, _ = env
    connection = MagicMock()
    await _set_all(hass, connection, {"id": 1, "type": "roommind/override/set_all", "mode": "eco"})
    connection.send_result.assert_called_once_with(1, {"success": True, "changed": 3})
    assert store.get_room("living")["override_type"] == "eco"


async def test_select_entity(env):
    hass, store, coordinator = env
    coordinator.hass = hass
    entity = RoomMindAllRoomsSelect(coordinator)
    assert entity.entity_id == "select.roommind_all_rooms"
    assert entity.options == ["schedule", "comfort", "eco", "frost"]
    assert entity.current_option == "schedule"
    with patch.object(entity, "async_write_ha_state") as write:
        await entity.async_select_option("comfort")
    write.assert_called_once()
    assert entity.current_option == "comfort"
    assert store.get_room("office")["override_type"] == "boost"
