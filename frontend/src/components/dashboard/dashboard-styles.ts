import { css } from "lit";

/** Layout shared by the dashboard and its edit mode: grid, floor headings, pills, empty states. */
export const dashboardStyles = css`
  :host {
    display: block;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr));
    gap: 12px;
  }

  h2.floor {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 20px 4px 10px;
    font-size: 16px;
    font-weight: 500;
  }

  h2.floor:first-of-type {
    margin-top: 4px;
  }

  h2.floor .count {
    font-weight: 400;
    font-size: 14px;
    color: var(--secondary-text-color);
    font-variant-numeric: tabular-nums;
  }

  .all-rooms {
    margin: 0 0 16px;
  }

  .all-rooms-head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 4px 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--secondary-text-color);
  }

  .all-rooms .error {
    margin: 6px 4px 0;
    font-size: 13px;
    color: var(--error-color);
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
  }

  .pills > span {
    display: inline-flex;
  }

  @media (max-width: 600px) {
    .pills {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      /* the pills scroll inside the content box, the page itself never gets wider */
      max-width: 100%;
      padding-bottom: 2px;
    }

    .pills::-webkit-scrollbar {
      display: none;
    }
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 72px 16px;
    text-align: center;
    color: var(--secondary-text-color);
  }

  .placeholder ha-icon {
    --mdc-icon-size: 56px;
    opacity: 0.4;
  }

  .placeholder p {
    margin: 0;
    font-size: 15px;
    max-width: 400px;
    line-height: 1.5;
  }
`;
