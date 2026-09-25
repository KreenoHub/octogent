import {
  COVERAGE_DIMENSION_LABELS,
  type CoverageDimension,
  type CoverageDimensionId,
  type CoverageState,
} from "@octogent/octoplan-protocol";
import "./coverage.css";

export type CoverageMapProps = {
  coverage: CoverageState;
  /** Rows to show, in order. Defaults to the dimensions present in `coverage`. */
  dimensions?: readonly CoverageDimensionId[];
};

const STATUS_TEXT = { unknown: "unknown", partial: "partial", covered: "covered" } as const;

const rowFor = (coverage: CoverageState, id: CoverageDimensionId): CoverageDimension =>
  coverage.dimensions.find((dimension) => dimension.id === id) ?? {
    id,
    status: "unknown",
    confidence: "low",
    questionIds: [],
    note: "",
  };

export const CoverageMap = ({ coverage, dimensions }: CoverageMapProps) => {
  const ids = dimensions ?? coverage.dimensions.map((dimension) => dimension.id);
  const rows = ids.map((id) => rowFor(coverage, id));
  const covered = rows.filter((row) => row.status === "covered").length;

  return (
    <div className="op-covmap">
      <p className="op-covmap-count" data-testid="coverage-count">
        <span className="op-covmap-count-value">{`${covered}/${rows.length}`}</span> covered
      </p>
      <ul className="op-covmap-list">
        {rows.map((row) => {
          const label = COVERAGE_DIMENSION_LABELS[row.id];
          const note = row.note.trim();
          return (
            <li
              key={row.id}
              className="op-covmap-row"
              data-dimension={row.id}
              data-status={row.status}
              aria-label={`${label}: ${STATUS_TEXT[row.status]}, ${row.confidence} confidence`}
              {...(note ? { title: note } : {})}
            >
              <span
                className="op-covmap-dot"
                data-confidence={row.confidence}
                aria-hidden="true"
              />
              <span className="op-covmap-label">{label}</span>
              <span className="op-covmap-bar" aria-hidden="true">
                <span className="op-covmap-seg" />
                <span className="op-covmap-seg" />
                <span className="op-covmap-seg" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
