import { useState } from "react";
import { Link } from "react-router-dom";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

interface Source {
  endpoint: string;
  params: Record<string, unknown>;
  document?: string | null;
  chunk_index?: number | null;
  score?: number | null;
}

interface AskResult {
  answer: string;
  intent: string;
  sources: Source[];
  sql?: string;
  rows?: Record<string, unknown>[];
}

type Mode = "data" | "docs" | "genie";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "data", label: "Live books", hint: "Answers computed from committed orders and the latest outlook." },
  { id: "docs", label: "Briefs", hint: "Answers grounded only in documents you attached." },
  { id: "genie", label: "Databricks", hint: "Questions answered from published marketplace numbers in the workspace." },
];

const EXAMPLES: Record<Mode, string[]> = {
  data: [
    "What is total revenue?",
    "Top 5 sellers?",
    "Which products need restocking?",
    "Outlook for revenue next month",
    "Are the books clean?",
    "Revenue by metro",
  ],
  docs: ["What drove growth in Q1?", "Summarize the attached reports"],
  genie: ["Total revenue by month", "Return rate by category"],
};

async function ask(mode: Mode, question: string): Promise<AskResult> {
  const path = mode === "data" ? "/api/ai/ask" : mode === "docs" ? "/api/ai/ask-docs" : "/api/ai/ask-genie";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Ask failed");
  return body as AskResult;
}

export default function Assistant() {
  const [mode, setMode] = useState<Mode>("data");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);

  async function submit(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await ask(mode, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setResult(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Ask" question={MODES.find((m) => m.id === mode)?.hint ?? ""} />

      <div className="inline-flex rounded-md bg-secondary p-1" role="tablist" aria-label="Answer source">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => switchMode(m.id)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              mode === m.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <Input
          placeholder="e.g. Which sellers need attention?"
          aria-label="Ask a business question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" disabled={busy} aria-label="Ask">
          <SendHorizontal size={16} />
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES[mode].map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQ(ex);
              submit(ex);
            }}
            className="rounded-full bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && <p className="text-[15px] text-destructive">{error}</p>}

      {result && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-[17px] leading-relaxed">{result.answer}</p>
            {result.rows && result.rows.length > 0 && (
              <p className="font-mono text-[13px] tabular-nums text-muted-foreground">
                {result.rows.length} row(s) returned
              </p>
            )}
            <details className="border-t border-border pt-3">
              <summary className="cursor-pointer text-[13px] text-muted-foreground">How this was answered</summary>
              <div className="mt-3 space-y-3">
                {result.sql && (
                  <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs text-secondary-foreground">
                    {result.sql}
                  </pre>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">Sources</span>
                  {result.sources.length > 0 ? (
                    result.sources.map((s, i) => (
                      <span key={`${s.endpoint}-${i}`} className="rounded-md bg-secondary px-2 py-1 font-mono text-xs">
                        {s.document
                          ? `${s.document}${s.chunk_index != null ? ` · passage ${s.chunk_index + 1}` : ""}`
                          : s.endpoint}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-muted-foreground">none — try an example above</span>
                  )}
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      <p className="text-[13px] text-muted-foreground">
        Live books today; published Databricks numbers when you pick that tab.{" "}
        <Link to="/pipeline" className="hover:underline">
          How numbers are trusted
        </Link>
      </p>
    </div>
  );
}
