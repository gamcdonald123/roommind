"""Select platform for RoomMind: one choice for all rooms."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ALL_ROOMS_MODES, DOMAIN
from .coordinator import RoomMindCoordinator
from .utils.all_rooms import all_rooms_mode, async_set_all_rooms


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up RoomMind select entities from a config entry."""
    coordinator: RoomMindCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([RoomMindAllRoomsSelect(coordinator)])


class RoomMindAllRoomsSelect(CoordinatorEntity, SelectEntity):
    """Schedule, comfort, eco or frost protection for every room at once.

    Shows the choice all rooms are on; unknown while the rooms differ.
    """

    _attr_has_entity_name = True
    _attr_options = ALL_ROOMS_MODES
    _attr_translation_key = "all_rooms"

    def __init__(self, coordinator: RoomMindCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}_all_rooms"
        self._attr_icon = "mdi:home-thermometer"
        self.entity_id = f"select.{DOMAIN}_all_rooms"

    @property
    def current_option(self) -> str | None:
        store = self.coordinator.hass.data[DOMAIN]["store"]
        return all_rooms_mode(self.coordinator.hass, store.get_rooms())

    async def async_select_option(self, option: str) -> None:
        await async_set_all_rooms(self.coordinator.hass, option)
        self.async_write_ha_state()
