import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Drop a marketplace export; the Great Expectations import contract gates every row. */
export function ImportPanel() {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["import-rules"], queryFn: api.importRules });
  const m = useMutation({
    mutationFn: api.uploadImport,
    onSuccess: (b) => {
      toast.success(`${b.filename} received`, { description: "Validating against the data contract…" });
      qc.invalidateQueries({ queryKey: ["imports"] });
      navigate(`/data/imports/${b.batch_id}`);
    },
    onError: (e: Error) => toast.error("Import refused", { description: e.message }),
  });
  const take = (f?: File | null) => f && m.mutate(f);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
        className={cn("dot-grid flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          drag ? "border-signal bg-signal-wash" : "border-line-strong")}
      >
        <FileUp className="size-7 text-ink-3" />
        <div className="font-serif text-[19px] font-semibold">Drop a marketplace export (.csv)</div>
        <p className="max-w-sm text-[13.5px] text-ink-2">
          Every row is checked against the data contract. Valid rows are appended; already-known rows are skipped; broken rows come back with the rule they broke.
        </p>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button onClick={() => input.current?.click()} disabled={m.isPending}
            className="rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50">
            {m.isPending ? "Uploading…" : "Choose a file"}
          </button>
          <a href={api.templateUrl} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[13px] font-medium hover:border-ink">
            <Download className="size-3.5" /> Template
          </a>
        </div>
      </div>
      <div className="panel p-5">
        <div className="label mb-3">The import contract · Great Expectations</div>
        <ul className="space-y-2 text-[13px]">
          {rules.data && Object.entries(rules.data.rules).map(([rule, why]) => (
            <li key={rule} className="flex gap-3">
              <span className="code w-28 shrink-0 font-medium text-ink">{rule}</span>
              <span className="text-ink-2">{why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-3">
          {rules.data ? `${rules.data.columns.length} columns, same as the source dataset; up to ${Math.round(rules.data.max_bytes / 1048576)} MB.` : ""} After an import, the books contract is re-validated automatically.
        </p>
      </div>
    </div>
  );
}
