import type { CoachSessionRecord } from "../types/coach";
export function CoachInsightsPanel({
  session,
}: {
  session: CoachSessionRecord;
}) {
  return (
    <details className="vc-card vc-details">
      <summary>More about your movement</summary>
      <div className="vc-metrics-table">
        <table>
          <thead>
            <tr>
              <th>Finger pair</th>
              <th>Opening</th>
              <th>Your goal</th>
            </tr>
          </thead>
          <tbody>
            {session.metrics.pairs.map((pair) => (
              <tr key={pair.pair}>
                <td>{pair.pair}</td>
                <td>
                  {pair.observedDegrees === null
                    ? "Not measured"
                    : `${pair.observedDegrees.toFixed(1)}°`}
                </td>
                <td>{pair.targetDegrees.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="vc-detail-metrics">
        <div>
          <dt>Movement clearly tracked</dt>
          <dd>{session.metrics.trackingPercent.toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Repetitions with enough measurements</dt>
          <dd>{session.metrics.assessedRepetitions}</dd>
        </div>
        <div>
          <dt>Variation between peak openings</dt>
          <dd>
            {session.metrics.consistencyDegrees === null
              ? "Needs two measured repetitions"
              : `${session.metrics.consistencyDegrees.toFixed(1)}°`}
          </dd>
        </div>
      </dl>
      {session.metrics.comparison && (
        <div className="vc-comparison">
          <h4>Compared with your previous matching session</h4>
          {session.metrics.comparison.pairs.map((pair) => (
            <p key={pair.pair}>
              {pair.pair}: {pair.changeDegrees >= 0 ? "+" : ""}
              {pair.changeDegrees.toFixed(1)}°
            </p>
          ))}
        </div>
      )}
      <p className="vc-help">
        These are estimated finger-axis angles, measured at the most open part
        of each recorded cycle. Webcam position, light, occlusion, and tracking
        gaps can affect them. Your goal is personal; these values do not measure
        neurological recovery.
      </p>
      {session.repetitions.some((rep) => rep.source === "manual") && (
        <p className="vc-help">
          Some repetitions were confirmed manually. The app does not treat that
          confirmation as proof of correct movement.
        </p>
      )}
      <p className="vc-help">
        Reference: {session.referenceVersion}. Measurement method:{" "}
        {session.analysisVersion}.
      </p>
    </details>
  );
}
