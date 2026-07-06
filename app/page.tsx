import { readFile } from "node:fs/promises";
import path from "node:path";
import DemoClient from "./DemoClient";
import { PRESETS } from "@/demo/presets";

type EvalSnapshot = {
  generatedAt: string;
  examples: number;
  categoryAccuracy: number;
  draftQualityPassRate: number;
  brierScore: number;
  reliability: Array<{
    range: string;
    count: number;
    meanConfidence: number;
    actualAccuracy: number;
    verdict: string;
  }>;
};

async function loadSnapshot(): Promise<EvalSnapshot | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "public", "eval-snapshot.json"),
      "utf8",
    );
    return JSON.parse(raw) as EvalSnapshot;
  } catch {
    return null;
  }
}

export default async function Page() {
  const snapshot = await loadSnapshot();
  const presets = PRESETS.map(({ id, label, hint }) => ({ id, label, hint }));

  return (
    <main className="wrap">
      <header className="site-header">
        <a className="wordmark" href="https://kevinmurphywebdev.com">
          kevinmurphywebdev.com
        </a>
        <nav className="links">
          <a
            href="https://github.com/midimurphdesigns/issuegraph"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>
        </nav>
      </header>

      <h1 className="display-title">issuegraph</h1>

      <p className="tagline">
        A GitHub issue triage agent built on LangGraph. It classifies an issue,
        routes it to a specialist drafter, loops the reply through a quality
        guard, and pauses for human approval when its own confidence is low.
        This page runs the real graph, streaming each node as it executes.
      </p>

      <DemoClient presets={presets} />

      <section>
        <div className="eyebrow">evals + calibration</div>
        {snapshot ? (
          <>
            <div className="eval-grid">
              <div className="stat">
                <div className="v">
                  {Math.round(snapshot.categoryAccuracy * 100)}%
                </div>
                <div className="k">category accuracy</div>
              </div>
              <div className="stat">
                <div className="v">
                  {Math.round(snapshot.draftQualityPassRate * 100)}%
                </div>
                <div className="k">draft quality (LLM judge)</div>
              </div>
              <div className="stat">
                <div className="v">{snapshot.brierScore.toFixed(3)}</div>
                <div className="k">brier score</div>
              </div>
              <div className="stat">
                <div className="v">{snapshot.examples}</div>
                <div className="k">golden examples</div>
              </div>
            </div>
            <table className="reliability">
              <thead>
                <tr>
                  <th>confidence bucket</th>
                  <th>n</th>
                  <th>claimed</th>
                  <th>actual</th>
                  <th>verdict</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.reliability.map((b) => (
                  <tr key={b.range}>
                    <td>{b.range}</td>
                    <td>{b.count}</td>
                    <td>{b.meanConfidence.toFixed(2)}</td>
                    <td>{b.actualAccuracy.toFixed(2)}</td>
                    <td>{b.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              Numbers from the committed golden-set run ({snapshot.examples}{" "}
              labeled issues) scored two ways: deterministic exact-match on the
              category, and an LLM judge on the drafted reply. The Brier score
              and reliability table check whether the classifier&apos;s stated
              confidence is honest. Small clean golden sets flatter the model;
              the interesting work is growing the set with production failures.
            </p>
          </>
        ) : (
          <p className="note">
            No eval snapshot found. Run <span className="mono">pnpm eval</span>{" "}
            to generate one.
          </p>
        )}
      </section>

      <footer>
        <span>
          Built by Kevin Murphy. LangGraph, LangSmith, Claude, Next.js.
        </span>
        <a
          href="https://github.com/midimurphdesigns/issuegraph"
          target="_blank"
          rel="noreferrer"
        >
          read the code
        </a>
      </footer>
    </main>
  );
}
