import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { HomeAssistant, PriceStatus } from "../../types";
import { floorGroups, type AreaInfo, type FloorOrder } from "../../utils/dashboard";
import { hasDevices } from "../../utils/room-state";
import {
  allRoomsMessage,
  allRoomsOptions,
  allRoomsValueOf,
  type AllRoomsValue,
} from "../../utils/override";
import { errorText } from "../../utils/errors";
import { localize, type TranslationKey } from "../../utils/localize";
import { formatTempLocale, tempUnit } from "../../utils/temperature";
import { VACATION_SENTINEL } from "../../utils/constants";
import { tokens } from "../../styles/tokens";
import { dashboardStyles } from "./dashboard-styles";
import "./rs-room-card";
import "../shared/rs-pill";
import "../shared/rs-segmented";
import "../shared/rs-info-icon";

export interface HouseSummary {
  vacationActive: boolean;
  vacationUntil: number | null;
  presenceEnabled: boolean;
  anyoneHome: boolean;
  outdoorTemp: number | null;
  priceEntity: string;
  priceStatus: PriceStatus | null;
}

/** How long a just-picked all-rooms choice waits for the poll to confirm it. */
const PENDING_TIMEOUT_MS = 8000;

const PRICE_LEVEL_KEYS: Record<"cheap" | "normal" | "expensive", TranslationKey> = {
  cheap: "settings.price_level_cheap",
  normal: "settings.price_level_normal",
  expensive: "settings.price_level_expensive",
};

/** Rooms tab: house summary pills and the room cards, grouped by floor if wanted. */
@customElement("rs-dashboard")
export class RsDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  /** All areas in display order, hidden ones included. */
  @property({ attribute: false }) public infos: AreaInfo[] = [];
  @property({ attribute: false }) public hiddenRooms: string[] = [];
  @property({ type: Boolean }) public groupByFloor = false;
  @property({ attribute: false }) public floorOrder: FloorOrder = { ha: [], own: [] };
  @property({ type: String }) public controlMode: "mpc" | "bangbang" = "mpc";
  @property({ type: Boolean }) public climateControlActive = true;
  @property({ attribute: false }) public summary!: HouseSummary;
  @state() private _pending: { value: AllRoomsValue; since: number } | null = null;
  @state() private _error = "";

  static styles = [tokens, dashboardStyles];

  render() {
    const l = this.hass.language;
    if (this.infos.length === 0) {
      return html`<div class="placeholder">
        <ha-icon icon="mdi:home"></ha-icon>
        <p>${localize("panel.no_areas", l)}<br />${localize("panel.no_areas_hint", l)}</p>
      </div>`;
    }
    const hidden = new Set(this.hiddenRooms);
    const visible = this.infos.filter((i) => !hidden.has(i.area.area_id));
    if (visible.length === 0) {
      return html`${this._renderPills(visible)}
        <div class="placeholder">
          <ha-icon icon="mdi:eye-off-outline"></ha-icon>
          <p>${localize("panel.all_hidden", l)}</p>
          <ha-button @click=${this._requestEdit}>${localize("panel.edit_rooms", l)}</ha-button>
        </div>`;
    }
    const groups = floorGroups(visible, this.hass, this.groupByFloor, this.floorOrder);
    return html`
      ${this._renderPills(visible)} ${this._renderAllRooms()}
      ${groups.map(
        (g) => html`
          ${
            g.name
              ? html`<h2 class="floor">${g.name} <span class="count">${g.items.length}</span></h2>`
              : nothing
          }
          <div class="grid">
            ${repeat(
              g.items,
              (i) => i.area.area_id,
              (i) =>
                html`<rs-room-card
                  .hass=${this.hass}
                  .area=${i.area}
                  .config=${i.config}
                  .climateEntityCount=${i.climateEntityCount}
                  .tempSensorCount=${i.tempSensorCount}
                  .controlMode=${this.controlMode}
                  .climateControlActive=${this.climateControlActive}
                ></rs-room-card>`,
            )}
          </div>
        `,
      )}
    `;
  }

  private _renderPills(visible: AreaInfo[]) {
    const l = this.hass.language;
    const s = this.summary;
    // Rooms RoomMind controls: outdoor areas and rooms without devices only measure
    const configured = visible.filter((i) => hasDevices(i.config) && !i.config?.is_outdoor);
    const heating = visible.filter((i) => i.config?.live?.mode === "heating").length;
    const cooling = visible.filter((i) => i.config?.live?.mode === "cooling").length;
    const mold = visible.filter(
      (i) =>
        i.config?.live?.mold_risk_level === "warning" ||
        i.config?.live?.mold_risk_level === "critical",
    ).length;
    const level = s.priceEntity ? s.priceStatus?.level : null;
    const vacationUntil =
      s.vacationActive && s.vacationUntil && s.vacationUntil < VACATION_SENTINEL
        ? new Intl.DateTimeFormat(l, { day: "numeric", month: "short" }).format(
            new Date(s.vacationUntil * 1000),
          )
        : null;

    const pills = [
      configured.length
        ? html`<rs-pill icon="mdi:home-thermometer-outline"
            >${localize("panel.pill.rooms", l)} <b>${configured.length}</b></rs-pill
          >`
        : nothing,
      configured.length
        ? html`<rs-pill icon="mdi:fire" .tone=${heating ? "heat" : "default"}
            >${localize("panel.pill.heating", l)} <b>${heating}</b></rs-pill
          >`
        : nothing,
      cooling
        ? html`<rs-pill icon="mdi:snowflake" tone="cool"
            >${localize("panel.pill.cooling", l)} <b>${cooling}</b></rs-pill
          >`
        : nothing,
      s.outdoorTemp != null
        ? html`<rs-pill icon="mdi:thermometer"
            >${localize("panel.pill.outdoor", l)}
            <b
              >${formatTempLocale(s.outdoorTemp, this.hass)}&nbsp;${tempUnit(this.hass)}</b
            ></rs-pill
          >`
        : nothing,
      level
        ? html`<rs-pill
            icon="mdi:cash-clock"
            .tone=${level === "cheap" ? "ok" : level === "expensive" ? "warn" : "default"}
            >${localize("panel.pill.price", l)}
            <b>${localize(PRICE_LEVEL_KEYS[level], l)}</b></rs-pill
          >`
        : nothing,
      s.vacationActive
        ? html`<rs-pill icon="mdi:airplane" tone="ok"
            >${
              vacationUntil
                ? localize("panel.pill.vacation_until", l, { date: vacationUntil })
                : localize("panel.stat.vacation", l)
            }</rs-pill
          >`
        : nothing,
      s.presenceEnabled && !s.anyoneHome
        ? html`<rs-pill icon="mdi:home-export-outline">${localize("panel.pill.away", l)}</rs-pill>`
        : nothing,
      mold
        ? html`<rs-pill icon="mdi:water-alert" tone="warn"
            ><b>${mold}</b> ${localize("panel.pill.mold", l)}</rs-pill
          >`
        : nothing,
    ].filter((p) => p !== nothing);
    if (!pills.length) return nothing;
    return html`<div class="pills" role="list" aria-label=${localize("panel.pill.label", l)}>
      ${pills.map((p) => html`<span role="listitem">${p}</span>`)}
    </div>`;
  }

  /** Rooms the all-rooms choice applies to, hidden ones included (same rule as the backend). */
  private _controlled(): AreaInfo[] {
    return this.infos.filter((i) => hasDevices(i.config) && !i.config?.is_outdoor);
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("infos") && this._pending) {
      const actual = allRoomsValueOf(this._controlled().map((i) => i.config?.live));
      if (actual === this._pending.value || Date.now() - this._pending.since > PENDING_TIMEOUT_MS) {
        this._pending = null;
      }
    }
  }

  private _renderAllRooms() {
    const rooms = this._controlled();
    // One room has its own choice on its card
    if (rooms.length < 2) return nothing;
    const l = this.hass.language;
    const value = this._pending
      ? this._pending.value
      : allRoomsValueOf(rooms.map((i) => i.config?.live));
    return html`<div class="all-rooms">
      <div class="all-rooms-head">
        <span>${localize("all_rooms.label", l)}</span>
        <rs-info-icon .text=${localize("all_rooms.hint", l)}></rs-info-icon>
      </div>
      <rs-segmented
        .label=${localize("all_rooms.label", l)}
        .options=${allRoomsOptions(l)}
        .value=${value}
        @value-changed=${this._onAllRooms}
      ></rs-segmented>
      ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing}
    </div>`;
  }

  private async _onAllRooms(e: CustomEvent<{ value: AllRoomsValue }>) {
    e.stopPropagation();
    const value = e.detail.value;
    this._pending = { value, since: Date.now() };
    this._error = "";
    try {
      await this.hass.callWS(allRoomsMessage(value));
      this.dispatchEvent(new CustomEvent("room-updated", { bubbles: true, composed: true }));
    } catch (err) {
      this._pending = null;
      const l = this.hass.language;
      this._error = errorText(err, localize("override.error_set", l), l);
    }
  }

  private _requestEdit() {
    this.dispatchEvent(new CustomEvent("edit-requested", { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "rs-dashboard": RsDashboard;
  }
}
