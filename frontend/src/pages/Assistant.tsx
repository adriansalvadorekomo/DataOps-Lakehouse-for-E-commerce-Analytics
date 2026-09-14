import { useState } from "react";
import { Link } from "react-router-dom";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type AskMode, type AskResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODES: { id: AskMode; label: string; hint: string; trust: string }[] = [
  {
    id: "data",
    label: "Live books",
    hint: "Answers computed from committed orders and the latest outlook.",
    trust: "Live books is deterministic and uses no LLM.",
  },
  {
    id: "docs",
    label: "Briefs",
    hint: "Answers grounded only in documents you attached.",
    trust: "Briefs is grounded only in attached files and says it does not know when there is no grounding.",
  },
  {
    id: "genie",
    label: "Databricks",
    hint: "Questions answered from published marketplace numbers in the workspace.",
    trust: "Databricks Genie answers from published marketplace numbers.",
  },
];

const EXAMPLES: Record<AskMode, string[]> = {
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

function displayValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) || "—";
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export default function Assistant() {
  const [mode, setMode] = useState<AskMode>("data");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];

  async function submit(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.ask(mode, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: AskMode) {
    setMode(nextMode);
    setResult(null);
    setError(null);
  }

  const rowKeys = result?.rows
    ? Array.from(new Set(result.rows.flatMap((row) => Object.keys(row ?? {}))))
    : [];
  const columns = rowKeys.length > 0 ? rowKeys : ["__result__"];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Ask" question={activeMode.hint} />

      <div className="inline-flex rounded-md bg-secondary p-1" role="group" aria-label="Answer source">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            onClick={() => switchMode(item.id)}
            className={cn(
              "min-h-10 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors",
              mode === item.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {activeMode.trust} Answers are stateless and never take actions.
      </p>

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
        <Button type="submit" disabled={busy || !q.trim()} aria-label="Ask">
          <SendHorizontal size={16} />
        </Button>
      </form>

      {busy && (
        <p role="status" className="text-[15px] text-muted-foreground">
          Answering…
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {EXAMPLES[mode].map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => {
              setQ(example);
              submit(example);
            }}
            className="min-h-10 rounded-full bg-secondary px-3 py-2 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-[15px] text-destructive">{error}</p>}

      {result && (
        <div aria-live="polite">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-[17px] leading-relaxed">{result.answer}</p>
              {result.rows && result.rows.length > 0 && (
                <Table className="text-[13px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {columns.map((column) => <TableHead key={column}>{column === "__result__" ? "Result" : column}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {columns.map((column) => (
                          <TableCell key={column} className="max-w-64 whitespace-normal break-words">
                            {column === "__result__" ? displayValue(row) : displayValue(row?.[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer text-[13px] text-muted-foreground">How this was answered</summary>
                <div className="mt-3 space-y-3">
                  {result.sql && (
                    <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs text-secondary-foreground">
                      {result.sql}
                    </pre>
                  )}
                  <details>
                    <summary className="cursor-pointer text-[13px] text-muted-foreground">Sources</summary>
                    <div className="mt-2 space-y-2">
                      {result.sources.length > 0 ? result.sources.map((source, index) => (
                        <div key={`${source.endpoint}-${index}`} className="rounded-md bg-secondary p-2 font-mono text-xs">
                          <p>{source.endpoint}</p>
                          <p>params: {displayValue(source.params)}</p>
                          {source.document && <p>document: {source.document}</p>}
                          {source.chunk_index != null && <p>passage: {source.chunk_index + 1}</p>}
                          {source.score != null && <p>score: {source.score}</p>}
                        </div>
                      )) : <p className="text-[13px] text-muted-foreground">No sources returned.</p>}
                    </div>
                  </details>
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-[13px] text-muted-foreground">
        Live books today; published Databricks numbers when you pick that mode.{" "}
        <Link to="/pipeline" className="hover:underline">
          How numbers are trusted
        </Link>
      </p>
    </div>
  );
}
