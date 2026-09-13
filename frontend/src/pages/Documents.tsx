import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader, StackError, TableSkeleton } from "@/components/PageHeader";

interface Doc {
  document_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "ready" | "failed";
  error: string | null;
}

interface Hit {
  document: string;
  chunk_index: number;
  content: string;
  score: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

const listDocs = () => api<Doc[]>("/documents");
const searchDocs = (query: string, k = 5) =>
  api<Hit[]>("/documents/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, k }),
  });

const STATUS_LABEL: Record<Doc["status"], string> = {
  uploaded: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function Documents() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const docs = useQuery({ queryKey: ["documents"], queryFn: listDocs, refetchInterval: 5000 });

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      return api<Doc>("/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      setFile(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Delete failed"),
  });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setError(null);
    try {
      setHits(await searchDocs(q.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Briefs"
        question="Attach PDF, Markdown, text or CSV (20 MB max). Ask uses only these files when you pick the Briefs tab."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            type="file"
            accept=".pdf,.md,.markdown,.txt,.csv"
            aria-label="Choose document"
            className="max-w-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending ? "Attaching…" : "Attach"}
          </Button>
          {error && <p className="w-full text-[15px] text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Attached</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docs.isError ? (
            <div className="p-5">
              <StackError />
            </div>
          ) : docs.isLoading ? (
            <TableSkeleton cols={4} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs.data ?? []).map((d) => (
                  <TableRow key={d.document_id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <FileText size={15} className="text-muted-foreground" />
                        {d.filename}
                      </span>
                      {d.error && <p className="mt-0.5 text-xs text-destructive">{d.error}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{(d.size_bytes / 1024).toFixed(1)} KB</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "ready" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                        {STATUS_LABEL[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" aria-label={`Delete ${d.filename}`} onClick={() => remove.mutate(d.document_id)}>
                        <Trash2 size={15} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {docs.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState title="Nothing attached yet" body="Attach a brief to ground Ask answers in your own documents." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2" onSubmit={search}>
            <Input
              placeholder="e.g. return policy for electronics"
              aria-label="Search documents"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit">Search</Button>
          </form>
          {hits && (
            <div className="space-y-3">
              {hits.length === 0 && <p className="text-[15px] text-muted-foreground">No matches.</p>}
              {hits.map((h, i) => (
                <div key={i} className="rounded-md border border-border p-4">
                  <p className="text-[13px] font-medium text-muted-foreground">
                    {h.document} · passage {h.chunk_index + 1}
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[13px] text-muted-foreground">How this was matched</summary>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">Relevance {h.score.toFixed(3)}</p>
                  </details>
                  <p className="mt-1 text-[15px] leading-relaxed">
                    {h.content.slice(0, 400)}
                    {h.content.length > 400 ? "…" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
