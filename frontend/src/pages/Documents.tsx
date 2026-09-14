import { useRef, useState } from "react";
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
import { api, type DocumentHit, type DocumentRecord } from "@/lib/api";

const STATUS_LABEL: Record<DocumentRecord["status"], string> = {
  uploaded: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function Documents() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DocumentHit[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const docs = useQuery({ queryKey: ["documents"], queryFn: api.listDocuments, refetchInterval: 5000 });

  const upload = useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: (document) => {
      setFile(null);
      setUploadError(null);
      setStatusMessage(`${document.filename} attached and processing.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setStatusMessage("");
    },
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: number; filename: string }) => api.deleteDocument(id),
    onSuccess: (_, variables) => {
      setConfirmingId(null);
      setDeleteError(null);
      setHits(null);
      setStatusMessage(`${variables.filename} deleted.`);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Delete failed");
      setStatusMessage("");
    },
  });

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const query = q.trim();
    if (!query || searchBusy) return;
    setSearchBusy(true);
    setSearchError(null);
    setHits(null);
    try {
      setHits(await api.searchDocuments(query));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Briefs"
        question="Attach PDF, Markdown, text or CSV (20 MB max). Ask uses only these files when you pick the Briefs mode."
      />

      <div role="status" aria-live="polite" className="text-[15px] text-muted-foreground">
        {statusMessage}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.csv"
            aria-label="Choose document"
            className="max-w-sm"
            disabled={upload.isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setUploadError(null);
            }}
          />
          <Button disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending ? "Attaching…" : "Attach"}
          </Button>
          {uploadError && <p role="alert" className="w-full text-[15px] text-destructive">{uploadError}</p>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Attached</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deleteError && <p role="alert" className="px-5 pb-3 text-[15px] text-destructive">{deleteError}</p>}
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
                {(docs.data ?? []).map((document) => {
                  const isDeleting = remove.isPending && remove.variables?.id === document.document_id;
                  const isConfirming = confirmingId === document.document_id;
                  return (
                    <TableRow key={document.document_id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <FileText size={15} className="text-muted-foreground" />
                          {document.filename}
                        </span>
                        {document.error && <p className="mt-0.5 text-xs text-destructive">{document.error}</p>}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {(document.size_bytes / 1024).toFixed(1)} KB
                      </TableCell>
                      <TableCell>
                        <Badge variant={document.status === "ready" ? "default" : document.status === "failed" ? "destructive" : "secondary"}>
                          {STATUS_LABEL[document.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isConfirming ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="mr-1 text-xs text-muted-foreground">Delete?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={remove.isPending}
                              aria-label={`Confirm delete ${document.filename}`}
                              onClick={() => remove.mutate({ id: document.document_id, filename: document.filename })}
                            >
                              {isDeleting ? "Deleting…" : "Confirm"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={remove.isPending}
                              aria-label={`Cancel delete ${document.filename}`}
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={remove.isPending}
                            aria-label={`Delete ${document.filename}`}
                            onClick={() => {
                              setConfirmingId(document.document_id);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
              disabled={searchBusy}
              onChange={(event) => setQ(event.target.value)}
            />
            <Button type="submit" disabled={searchBusy || !q.trim()}>
              {searchBusy ? "Searching…" : "Search"}
            </Button>
          </form>
          {searchBusy && <p role="status" className="text-[15px] text-muted-foreground">Searching…</p>}
          {searchError && <p role="alert" className="text-[15px] text-destructive">{searchError}</p>}
          {hits && (
            <div className="space-y-3" aria-live="polite">
              {hits.length === 0 && <p className="text-[15px] text-muted-foreground">No matches found.</p>}
              {hits.map((hit, index) => (
                <div key={`${hit.document}-${hit.chunk_index}-${index}`} className="rounded-md border border-border p-4">
                  <p className="text-[15px] font-medium">{hit.document}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[13px] text-muted-foreground">How this was matched</summary>
                    <div className="mt-2 space-y-2 text-[13px] text-muted-foreground">
                      <p>Passage {hit.chunk_index + 1} · relevance {hit.score.toFixed(3)}</p>
                      <p className="text-[15px] leading-relaxed text-foreground">
                        {hit.content.slice(0, 400)}{hit.content.length > 400 ? "…" : ""}
                      </p>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
