"use client";

/**
 * Live eval scoreboard. Fetches /api/scoreboard on mount and whenever
 * `refreshKey` changes (DemoClient bumps it after each run finishes), so
 * the numbers grow in real time as visitors triage presets.
 */
import { useEffect, useState } from "react";

type PresetScore = {
  id: string;
  label: string;
  expected: string | null;
  runs: number;
  correct: number;
  accuracy: number | null;
  meanConfidence: number | null;
};

type Scoreboard = {
  perPreset: PresetScore[];
  totalRuns: number;
  overallAccuracy: number | null;
  live: boolean;
};

export default function LiveScoreboard({ refreshKey }: { refreshKey: number }) {
  const [board, setBoard] = useState<Scoreboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/scoreboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: Scoreboard) => {
        if (!cancelled) setBoard(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!board) return null;

  return (
    <section>
      <div className="eyebrow">
        live scoreboard
        {board.totalRuns > 0 && (
          <span className="live-dot" aria-hidden />
        )}
      </div>

      {board.totalRuns === 0 ? (
        <p className="note">
          No runs yet. Triage a preset above and its result lands here.
          Every run is a real labeled outcome, so accuracy and confidence
          accumulate live as the demo gets used.
        </p>
      ) : (
        <>
          <div className="eval-grid">
            <div className="stat">
              <div className="v">
                {board.overallAccuracy === null
                  ? "—"
                  : `${Math.round(board.overallAccuracy * 100)}%`}
              </div>
              <div className="k">live category accuracy</div>
            </div>
            <div className="stat">
              <div className="v">{board.totalRuns}</div>
              <div className="k">total runs</div>
            </div>
          </div>

          <table className="reliability">
            <thead>
              <tr>
                <th>preset</th>
                <th>expected</th>
                <th>runs</th>
                <th>accuracy</th>
                <th>mean confidence</th>
              </tr>
            </thead>
            <tbody>
              {board.perPreset.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td>{p.expected ?? "ambiguous"}</td>
                  <td>{p.runs}</td>
                  <td>
                    {p.accuracy === null
                      ? "—"
                      : `${Math.round(p.accuracy * 100)}%`}
                  </td>
                  <td>
                    {p.meanConfidence === null
                      ? "—"
                      : p.meanConfidence.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="note">
            {board.live
              ? "Live from real visitor runs. Each preset carries the category a maintainer would assign, so every run scores against a known answer. The ambiguous preset records confidence but is not graded, because there is no single right answer for it."
              : "Scoreboard storage is not configured on this deployment, so these numbers stay at zero. The golden-set benchmark below is the fixed reference."}
          </p>
        </>
      )}
    </section>
  );
}
