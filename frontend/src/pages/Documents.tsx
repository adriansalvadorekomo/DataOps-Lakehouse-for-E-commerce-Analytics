import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, FileText, Trash2 } from "lucide-react";
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
import { Disclosure } from "@/components/Disclosure";
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
  const [query, setQuery] = useState("");
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
      void qc.invalidateQueries({ queryKey: ["documents"] });
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
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Delete failed");
      setStatusMessage("");
    },
  });

  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || searchBusy) return;
    setSearchBusy(true);
    setSearchError(null);
    setHits(null);
    try {
      setHits(await api.searchDocuments(trimmedQuery));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge library"
        title="Documents"
        question="Attach source files for document search and Ask mode. PDF, Markdown, text and CSV files are supported."
      />

      {statusMessage && <div role="status" aria-live="polite" className="border-l-2 border-primary pl-3 text-[15px] text-muted-foreground">{statusMessage}</div>}

      <section aria-labelledby="attach-title" className="panel p-4">
        <h2 id="attach-title" className="section-title">Attach a document</h2>
        <p id="file-hint" className="mt-1 text-[13px] text-muted-foreground">Choose a PDF, Markdown, text or CSV file up to 20 MB.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.csv"
            aria-label="Choose document"
            aria-describedby="file-hint"
            className="h-11 max-w-sm"
            disabled={upload.isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setUploadError(null);
            }}
          />
          <Button className="min-h-11" disabled={!file || upload.isPending} onClick={() => file && upload.mutate(file)}>
            {upload.isPending ? "Attaching…" : "Attach document"}
          </Button>
          {uploadError && <p role="alert" className="w-full text-[15px] text-destructive">{uploadError}</p>}
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Attached documents</CardTitle></CardHeader>
        <CardContent className="p-0">
          {deleteError && <p role="alert" className="px-5 pb-3 text-[15px] text-destructive">{deleteError}</p>}
          {docs.isError ? (
            <div className="p-5"><StackError retry={() => void docs.refetch()} /></div>
          ) : docs.isLoading ? (
            <TableSkeleton cols={4} />
          ) : (
            <Table>
              <caption className="sr-only">Attached document files, sizes, processing statuses and actions</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">File</TableHead>
                  <TableHead scope="col" className="text-right">Size</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs.data ?? []).map((document) => {
                  const isDeleting = remove.isPending && remove.variables?.id === document.document_id;
                  const isConfirming = confirmingId === document.document_id;
                  return (
                    <TableRow key={document.document_id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-medium"><FileText size={15} className="text-muted-foreground" />{document.filename}</span>
                        {document.error && <p className="mt-0.5 text-xs text-destructive">{document.error}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{(document.size_bytes / 1024).toFixed(1)} KB</TableCell>
                      <TableCell><Badge variant={document.status === "ready" ? "default" : document.status === "failed" ? "destructive" : "secondary"}>{STATUS_LABEL[document.status]}</Badge></TableCell>
                      <TableCell className="text-right">
                        {isConfirming ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-1">
                            <span className="mr-1 text-xs text-muted-foreground">Delete this file?</span>
                            <Button variant="destructive" className="min-h-11" disabled={remove.isPending} aria-label={`Confirm delete ${document.filename}`} onClick={() => remove.mutate({ id: document.document_id, filename: document.filename })}>{isDeleting ? "Deleting…" : "Delete"}</Button>
                            <Button variant="ghost" className="min-h-11" disabled={remove.isPending} aria-label={`Cancel delete ${document.filename}`} onClick={() => setConfirmingId(null)}>Cancel</Button>
                          </span>
                        ) : (
                          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={remove.isPending} aria-label={`Delete ${document.filename}`} onClick={() => { setConfirmingId(document.document_id); setDeleteError(null); }}><Trash2 size={15} /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {docs.data?.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="p-0"><EmptyState title="No documents attached" body="Attach a source file to search inside it or use it in Ask mode." /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="search-title" className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 id="search-title" className="section-title">Search documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Preview what Ask mode can quote from your files.</p>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={search}>
          <label htmlFor="document-search" className="sr-only">Search documents</label>
          <Input id="document-search" className="h-11" placeholder="e.g. return policy for electronics" value={query} disabled={searchBusy} onChange={(event) => setQuery(event.target.value)} />
          <Button type="submit" className="min-h-11" disabled={searchBusy || !query.trim()}>{searchBusy ? "Searching…" : "Search documents"}</Button>
        </form>
        {searchBusy && <p role="status" className="text-[15px] text-muted-foreground">Searching your documents…</p>}
        {searchError && (
          <div role="alert" className="border-l-2 border-destructive pl-3 text-[15px]">
            <p className="text-destructive">{searchError}</p>
            <button type="button" onClick={() => void search()} className="mt-2 min-h-11 font-medium text-link underline underline-offset-4">Try search again</button>
          </div>
        )}
        {hits === null && !searchBusy && !searchError && (
          <div className="flex gap-3 border-y border-border py-6 text-muted-foreground">
            <FileSearch className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div><p className="text-[15px] font-medium text-foreground">Search before asking</p><p className="mt-1 text-[15px]">Enter a policy, product or process question to see what your files say before you ask.</p></div>
          </div>
        )}
        {hits && (
          <div className="divide-y divide-border" aria-live="polite">
            {hits.length === 0 && <p className="py-6 text-[15px] text-muted-foreground">No matching passages found. Try a different phrase or attach another document.</p>}
            {hits.map((hit, index) => (
              <article key={`${hit.document}-${hit.chunk_index}-${index}`} className="py-5">
                <p className="text-[15px] font-medium">{hit.document}</p>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-foreground">{hit.content.slice(0, 400)}{hit.content.length > 400 ? "…" : ""}</p>
                <Disclosure summary="Match evidence" eyebrow="Technical detail" className="mt-3 bg-transparent">
                  <p>Passage {hit.chunk_index + 1}</p>
                </Disclosure>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
