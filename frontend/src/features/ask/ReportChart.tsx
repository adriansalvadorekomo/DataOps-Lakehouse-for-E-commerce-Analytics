import { useRef } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Check } from "lucide-react";
import type { ValueKind } from "@/lib/api";
import { date, inr, int, month, pct } from "@/lib/format";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "@/components/data/ChartFrame";

export interface ChartSpec {
  type: "trend" | "columns" | "ranking" | "split" | "curve" | "forecast" | "status";
  title?: string;
  kind?: ValueKind;
  data?: Record<string, number | string>[];
  series?: { key: string; label: string }[];
  ascending?: boolean;
  today?: string;
  current?: string;
}

const fmt = (kind: ValueKind | undefined) => (n: number) =>
  kind === "inr" ? inr(n) : kind === "pct" ? pct(n) : int(n);

const PALETTE = ["var(--signal)", "var(--violet)", "var(--ink-2)", "var(--good)", "var(--warn)", "var(--ink-3)"];
const TONE: Record<string, string> = { good: "var(--good)", signal: "var(--signal)" };

function Trend({ spec }: { spec: ChartSpec }) {
  const data = spec.data ?? [];
  const last = data.at(-1);
  const f = fmt(spec.kind);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="rep-trend" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 6" />
        <XAxis dataKey="x" tickFormatter={(x) => (String(x).length === 7 ? month(String(x)) : date(String(x)))} tickLine={false} axisLine={false} minTickGap={32} />
        <YAxis orientation="right" tickFormatter={f} tickLine={false} axisLine={false} width={62} tickCount={4} domain={["auto", "auto"]} />
        <Tooltip content={<ChartTooltip format={f} labelFormat={(l) => (l.length === 7 ? month(l) : date(l))} />} />
        <Area type="monotone" dataKey="y" name={spec.title ?? "Value"} stroke="var(--ink)" strokeWidth={2.4} fill="url(#rep-trend)" animationDuration={900} />
        {last && <ReferenceDot x={last.x} y={last.y as number} r={5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Ranking({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const data = (spec.data ?? []) as { label: string; value: number; hint?: string }[];
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const f = fmt(spec.kind);
  const isId = (s: string) => /^[SPU]\d+$/.test(s);
  useGSAP(() => {
    withMotion(() => {
      gsap.from(".bar", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, stagger: 0.05, ease: "power3.out" });
    });
  }, { scope: ref });
  return (
    <div ref={ref} className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.label} className="grid grid-cols-[minmax(84px,130px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <span className={cn("truncate", isId(d.label) ? "code font-medium" : "font-medium")} title={d.hint ?? d.label}>{d.label}</span>
          <div className="h-2.5 rounded-full bg-sunken">
            <div
              className="bar h-full rounded-full"
              style={{
                width: `${Math.max(2, (spec.ascending ? 1 - d.value / max + 0.15 : d.value / max) * 100)}%`,
                background: i === 0 ? "var(--signal)" : "var(--ink-2)",
                opacity: i === 0 ? 1 : 0.55,
              }}
            />
          </div>
          <span className={cn("num w-20 text-right", i === 0 && "font-semibold")}>{f(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Columns({ spec }: { spec: ChartSpec }) {
  const f = fmt(spec.kind);
  const [a, b] = spec.series ?? [];
  return (
    <>
      <div className="mb-2 flex gap-4 text-[12px] text-ink-2">
        {a && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-ink-2" />{a.label}</span>}
        {b && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-good" />{b.label} <span className="text-ink-3">(red = a loss)</span></span>}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={spec.data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} strokeDasharray="2 6" />
          <XAxis dataKey="x" tickLine={false} axisLine={false} />
          <YAxis orientation="right" tickFormatter={f} tickLine={false} axisLine={false} width={62} tickCount={4} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip content={<ChartTooltip format={f} />} cursor={{ fill: "var(--sunken)" }} />
          {a && <Bar dataKey={a.key} name={a.label} fill="var(--ink-2)" fillOpacity={0.6} radius={[4, 4, 0, 0]} />}
          {b && (
            <Bar dataKey={b.key} name={b.label} radius={[4, 4, 4, 4]}>
              {(spec.data ?? []).map((d, i) => <Cell key={i} fill={(d[b.key] as number) < 0 ? "var(--signal)" : "var(--good)"} />)}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function Split({ spec }: { spec: ChartSpec }) {
  const data = (spec.data ?? []) as { label: string; value: number; tone?: string }[];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const f = fmt(spec.kind);
  const color = (d: { tone?: string }, i: number) => (d.tone ? TONE[d.tone] : PALETTE[i % PALETTE.length]);
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
      <div className="relative mx-auto size-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={64} outerRadius={94} paddingAngle={2} stroke="var(--panel)" strokeWidth={2} startAngle={90} endAngle={-270} animationDuration={900}>
              {data.map((d, i) => <Cell key={d.label} fill={color(d, i)} />)}
            </Pie>
            <Tooltip content={<ChartTooltip format={f} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-[24px] font-semibold leading-none">{pct(data[0]?.value / total, 0)}</span>
          <span className="mt-1 max-w-[100px] truncate text-[11.5px] text-ink-3">{data[0]?.label}</span>
        </div>
      </div>
      <ul className="space-y-2 text-[13px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-3">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(d, i) }} />
            <span className="flex-1 font-medium">{d.label}</span>
            <span className="num text-ink-3">{f(d.value)}</span>
            <span className="num w-12 text-right font-semibold">{pct(d.value / total, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Curve({ spec }: { spec: ChartSpec }) {
  const top20 = (spec.data ?? []).find((d) => d.x === 20)?.y as number | undefined;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={spec.data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 6" />
        <XAxis dataKey="x" type="number" domain={[0, 100]} tickFormatter={(v) => `Top ${v}%`} tickLine={false} axisLine={false} ticks={[20, 40, 60, 80, 100]} />
        <YAxis orientation="right" domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 1 }]} stroke="var(--line-strong)" strokeDasharray="4 4" />
        <Tooltip content={<ChartTooltip format={(n) => pct(n)} labelFormat={(l) => `Best ${l}% of customers`} />} />
        <Line type="monotone" dataKey="y" name="Share of revenue" stroke="var(--violet)" strokeWidth={2.6} dot={{ r: 3, fill: "var(--violet)" }} animationDuration={900} />
        {top20 !== undefined && <ReferenceDot x={20} y={top20} r={6} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2}
          label={{ value: `${pct(top20, 0)} of revenue`, position: "right", fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Forecast({ spec }: { spec: ChartSpec }) {
  const f = fmt(spec.kind);
  return (
    <>
      <div className="mb-2 flex gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-ink" />Actual</span>
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-violet" />Expected</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={spec.data} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="rep-fc" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--violet)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--violet)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 6" />
          <XAxis dataKey="x" tickFormatter={(x) => date(String(x)).slice(0, 6)} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis orientation="right" tickFormatter={f} tickLine={false} axisLine={false} width={62} tickCount={4} domain={["auto", "auto"]} />
          {spec.today && <ReferenceLine x={spec.today} stroke="var(--line-strong)" strokeDasharray="4 4" label={{ value: "Today", position: "top", fill: "var(--ink-3)", fontSize: 11 }} />}
          <Tooltip content={<ChartTooltip format={f} labelFormat={(l) => date(l)} />} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--ink)" strokeWidth={1.8} dot={false} />
          <Area type="monotone" dataKey="expected" name="Expected" stroke="var(--violet)" strokeWidth={2.6} fill="url(#rep-fc)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function Status({ spec }: { spec: ChartSpec }) {
  const current = (spec.current ?? "").toLowerCase();
  const ended = current !== "in transit";
  const steps = ["Ordered", "In transit", ended ? spec.current ?? "Delivered" : "Delivered"];
  const at = ended ? 2 : 1;
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
            i < at ? "bg-ink text-canvas" : i === at ? "bg-signal text-white ring-4 ring-signal-wash" : "bg-sunken text-ink-3")}>
            {i < at ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("text-[13px]", i === at ? "font-semibold" : "text-ink-3")}>{s}</span>
          {i < steps.length - 1 && <span className={cn("h-[2px] flex-1 rounded", i < at ? "bg-ink" : "bg-line")} />}
        </li>
      ))}
    </ol>
  );
}

/** The visual that answers the question, chosen by the report layer. */
export function ReportChart({ spec }: { spec: ChartSpec }) {
  const body = {
    trend: <Trend spec={spec} />,
    ranking: <Ranking spec={spec} />,
    columns: <Columns spec={spec} />,
    split: <Split spec={spec} />,
    curve: <Curve spec={spec} />,
    forecast: <Forecast spec={spec} />,
    status: <Status spec={spec} />,
  }[spec.type];
  if (!body) return null;
  return (
    <figure className="blk mt-5">
      {spec.title && <figcaption className="mb-3 text-[13px] font-semibold text-ink-2">{spec.title}</figcaption>}
      {body}
    </figure>
  );
}
