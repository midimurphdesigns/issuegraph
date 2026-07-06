"use client";

/**
 * The interactive demo. Picks a preset, POSTs to /api/triage, and animates
 * the pipeline from the SSE events as the graph executes server-side.
 * If the graph interrupts at the confidence gate, renders the approval
 * panel and resumes via /api/resume with the human's decision.
 */
import { useCallback, useRef, useState } from "react";
import LiveScoreboard from "./LiveScoreboard";

type PresetInfo = { id: string; label: string; hint: string };

type StageId = "classify" | "draft" | "guard" | "gate";
type StageStatus = "idle" | "running" | "done" | "looped";

type Classification = { category: string; confidence: number; reasoning: string };

type InterruptPayload = {
  reason: string;
  confidence: number;
  category?: string;
  draft: string;
};

type FinalResult = {
  category?: string;
  confidence?: number;
  status: string;
  redrafts: number;
  draft: string;
};

type SseEvent =
  | { type: "node"; node: string; update: Record<string, unknown> }
  | { type: "interrupt"; threadId: string; payload: InterruptPayload }
  | { type: "done"; result: FinalResult }
  | { type: "error"; message: string };

const STAGES: Array<{ id: StageId; name: string; blurb: string }> = [
  { id: "classify", name: "classify", blurb: "category + confidence" },
  { id: "draft", name: "draft", blurb: "specialist reply node" },
  { id: "guard", name: "guard", blurb: "LLM judge: good enough?" },
  { id: "gate", name: "gate", blurb: "confident? finalize : ask a human" },
];

function stageForNode(node: string): StageId | null {
  if (node === "classify") return "classify";
  if (node.startsWith("draft")) return "draft";
  if (node === "guard") return "guard";
  if (node === "gate") return "gate";
  return null;
}

export default function DemoClient({ presets }: { presets: PresetInfo[] }) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Default ON so the first run showcases the human-in-the-loop interrupt,
  // the part of the graph this demo exists to show.
  const [requireApproval, setRequireApproval] = useState(true);
  const [stages, setStages] = useState<Record<StageId, StageStatus>>({
    classify: "idle",
    draft: "idle",
    guard: "idle",
    gate: "idle",
  });
  const [details, setDetails] = useState<Partial<Record<StageId, string>>>({});
  const [classification, setClassification] = useState<Classification | null>(null);
  const [interruptInfo, setInterruptInfo] = useState<{
    threadId: string;
    payload: InterruptPayload;
  } | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after the classify node records to the scoreboard, so the live
  // board refetches and shows this run's contribution.
  const [scoreboardKey, setScoreboardKey] = useState(0);
  const redraftsRef = useRef(0);

  const reset = () => {
    setStages({ classify: "idle", draft: "idle", guard: "idle", gate: "idle" });
    setDetails({});
    setClassification(null);
    setInterruptInfo(null);
    setResult(null);
    setError(null);
    redraftsRef.current = 0;
  };

  const handleEvent = useCallback((e: SseEvent) => {
    if (e.type === "error") {
      setError(e.message);
      return;
    }
    if (e.type === "interrupt") {
      setStages((s) => ({ ...s, gate: "running" }));
      setDetails((d) => ({ ...d, gate: "paused: waiting for a human" }));
      setInterruptInfo({ threadId: e.threadId, payload: e.payload });
      return;
    }
    if (e.type === "done") {
      setStages((s) => ({ ...s, gate: "done" }));
      setDetails((d) => ({ ...d, gate: e.result.status }));
      setResult(e.result);
      return;
    }

    // node event: mark this stage done, light up the next one
    const stage = stageForNode(e.node);
    if (!stage) return;

    setStages((prev) => {
      const next = { ...prev, [stage]: "done" as StageStatus };
      const order: StageId[] = ["classify", "draft", "guard", "gate"];
      const idx = order.indexOf(stage);
      const upcoming = order[idx + 1];
      if (upcoming && next[upcoming] === "idle") next[upcoming] = "running";
      return next;
    });

    if (stage === "classify" && e.update.classification) {
      const c = e.update.classification as Classification;
      setClassification(c);
      setDetails((d) => ({
        ...d,
        classify: `${c.category} @ ${c.confidence}`,
      }));
      // The server records this classify outcome to the scoreboard; give
      // the write a beat to land, then refetch the live board.
      window.setTimeout(() => setScoreboardKey((k) => k + 1), 600);
    }
    if (stage === "draft") {
      const count = (e.update.redraftCount as number) ?? 1;
      redraftsRef.current = count;
      setDetails((d) => ({
        ...d,
        draft: count > 1 ? `redraft ${count - 1} (guard sent it back)` : "drafted",
      }));
    }
    if (stage === "guard") {
      const approved = e.update.guardApproved as boolean;
      const feedback = (e.update.guardFeedback as string) ?? "";
      setDetails((d) => ({
        ...d,
        guard: approved ? "approved" : `rejected: ${feedback.slice(0, 80)}`,
      }));
      if (!approved) {
        // graph loops back to the draft node
        setStages((s) => ({ ...s, guard: "looped", draft: "running" }));
      }
    }
  }, []);

  const consumeSse = useCallback(
    async (res: Response) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          handleEvent(JSON.parse(line.slice(6)) as SseEvent);
        }
      }
    },
    [handleEvent],
  );

  const run = useCallback(
    async (presetId: string) => {
      reset();
      setActivePreset(presetId);
      setRunning(true);
      setStages((s) => ({ ...s, classify: "running" }));
      try {
        const res = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId, requireApproval }),
        });
        await consumeSse(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something broke.");
      } finally {
        setRunning(false);
      }
    },
    [consumeSse, requireApproval],
  );

  const decide = useCallback(
    async (approved: boolean) => {
      if (!interruptInfo) return;
      const { threadId } = interruptInfo;
      setInterruptInfo(null);
      setRunning(true);
      try {
        const res = await fetch("/api/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, approved }),
        });
        await consumeSse(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something broke.");
      } finally {
        setRunning(false);
      }
    },
    [interruptInfo, consumeSse],
  );

  return (
    <>
      <section>
        <div className="eyebrow">pick an issue</div>
        <div className="presets">
          {presets.map((p) => (
            <button
              key={p.id}
              className={`preset${activePreset === p.id ? " active" : ""}`}
              disabled={running}
              onClick={() => run(p.id)}
            >
              {p.label}
              <span className="hint">{p.hint}</span>
            </button>
          ))}
        </div>
        <label className={`hitl-toggle${requireApproval ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={requireApproval}
            disabled={running}
            onChange={(e) => setRequireApproval(e.target.checked)}
          />
          <span className="box" aria-hidden />
          <span className="text">
            <strong>Human in the loop:</strong> pause the graph and ask me
            before finalizing
            <span className="sub">
              off = the agent only asks when its own confidence is low
            </span>
          </span>
        </label>
      </section>

      <section>
        <div className="eyebrow">the graph, live</div>
        <div className="pipeline">
          {STAGES.map((s) => (
            <div key={s.id} className={`stage ${stages[s.id]}`}>
              <div className="name">{s.name}</div>
              <div className="detail">{details[s.id] ?? s.blurb}</div>
            </div>
          ))}
        </div>

        {interruptInfo && (
          <div className="interrupt">
            <h3>The graph paused and is waiting for you.</h3>
            <div className="why mono">
              {interruptInfo.payload.reason}; the graph called interrupt(),
              checkpointed its state (confidence{" "}
              {interruptInfo.payload.confidence}), and will resume with your
              decision
            </div>
            <div className="draft">{interruptInfo.payload.draft}</div>
            <div className="actions">
              <button className="btn approve" onClick={() => decide(true)}>
                Approve draft
              </button>
              <button className="btn reject" onClick={() => decide(false)}>
                Reject
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="result">
            <div className="meta">
              <span>
                <span className="k">category</span>
                {result.category}
              </span>
              <span>
                <span className="k">confidence</span>
                {result.confidence}
                <span className="confbar">
                  <span style={{ width: `${(result.confidence ?? 0) * 100}%` }} />
                </span>
              </span>
              <span>
                <span className="k">redrafts</span>
                {Math.max(0, result.redrafts - 1)}
              </span>
              <span className={`status-${result.status}`}>
                <span className="k">status</span>
                {result.status}
              </span>
            </div>
            {result.status !== "human-rejected" && (
              <div className="draft">{result.draft}</div>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {!running && !result && !interruptInfo && !error && classification === null && (
          <p className="note">
            Pick a preset above. You will watch the LangGraph state machine run
            node by node: classify, route to a specialist drafter, loop through a
            quality guard, then either finalize or stop and ask you to approve.
            The last preset is intentionally ambiguous and usually pauses the
            graph for human review.
          </p>
        )}
      </section>

      <LiveScoreboard refreshKey={scoreboardKey} />
    </>
  );
}
