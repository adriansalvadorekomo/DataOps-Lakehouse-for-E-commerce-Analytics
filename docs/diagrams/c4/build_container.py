"""Draw the "How it works" diagram: C4 level 2, the containers (docs/diagrams/c4/c4-container-*.svg).

Same engine and design system as the EventZilla, Episteme and RoadAnomaly diagrams (kit/c4kit.py):
the dot-matrix mark in the frame, hairlines, technology logos on black chips, and one orange element,
the fail-fast DQ gate between Silver and Gold.

Every element comes from the repository: docs/architecture.md, compose.yaml, backend/app (API, governance,
forecast), frontend/, lakehouse/ (notebooks, src/quality/rules.py), .github/workflows (ci.yml, cd.yml),
infra/terraform, mise.toml.

    uv run --no-project --with fonttools --with brotli python docs/diagrams/c4/build_container.py [--png]

The system-context view (level 1) is still drawn by build_c4.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "kit"))
from c4kit import Box, Canvas, View, build  # noqa: E402

READOUT = [("ORDERS", "1,000,000"), ("DQ VIOLATIONS", "0 (R1–R9)"), ("GOLD REVENUE", "±1,000 INR")]

W = 248  # card width on the four-column grid
XS = [32, 344, 656, 1000]


def container_view(cv: Canvas):
    # ── outside the planes ─────────────────────────────────────────────────
    team = Box(XS[0], 184, W, 96)
    exports = Box(XS[1], 184, W, 96)
    analyst = Box(XS[3], 184, W, 96)

    # ── operational plane: Docker Compose, PostgreSQL owns every write ─────
    tower = Box(XS[0], 344, W, 128)
    api = Box(XS[1], 344, W, 128)
    forecast = Box(XS[0], 544, W, 128)
    contracts = Box(XS[1], 544, W, 128)
    pg = Box(XS[0], 744, 560, 128)

    # ── analytical plane, serving side: Databricks ─────────────────────────
    aibi = Box(XS[2], 344, W, 128)
    mlflow = Box(XS[3], 344, W, 128)
    fm = Box(XS[2], 544, W, 128)
    workflows = Box(XS[2], 744, W, 128)

    # ── the dataset, between the two planes ────────────────────────────────
    csv = Box(XS[0], 936, 208, 96)

    # ── the medallion job ──────────────────────────────────────────────────
    mw, my = 208, 1112
    mx = [32, 282, 532, 782, 1032]
    landing, bronze, silver, gate, gold = (Box(x, my, mw, 128) for x in mx)

    # ── delivery: GitHub ───────────────────────────────────────────────────
    ci = Box(XS[0], 1352, W, 128)
    cd = Box(XS[1], 1352, W, 128)
    tf = Box(XS[2], 1352, W, 128)
    mise = Box(XS[3], 1352, W, 128)

    cv.zone(Box(16, 312, 608, 592), "OPERATIONAL PLANE", "docker compose · owns every write", at="bottom", lx=300)
    cv.zone(Box(640, 312, 624, 592), "ANALYTICAL PLANE", "databricks · never writes back", at="top", lx=812)
    cv.zone(Box(16, 1080, 1248, 192), "MEDALLION JOB", "workflows · smart-erp-medallion", at="top", lx=300)
    cv.zone(Box(16, 1320, 1248, 192), "DELIVERY", "github · trunk-based, every change through a PR", at="bottom", lx=300)

    # people and new data in
    cv.arrow([(team.cx, team.b), (team.cx, tower.y)])
    cv.label([("browser", True)], team.cx + 12, 300, "start")
    cv.arrow([(exports.cx, exports.b), (exports.cx, api.y)])
    cv.label([("POST /imports", True)], exports.cx + 12, 300, "start")
    cv.arrow([(analyst.x, analyst.cy), (aibi.cx, analyst.cy), (aibi.cx, aibi.y)])
    cv.label([("explores Gold", False)], 890, analyst.cy - 12)

    # operational plane
    cv.arrow([(tower.r, 392), (api.x, 392)])
    cv.label([("/api", True)], 312, 380)
    cv.arrow([(api.cx, api.b), (api.cx, contracts.y)])
    cv.label([("gates every row", False)], api.cx - 12, 512, "end")
    cv.arrow([(contracts.cx, contracts.b), (contracts.cx, pg.y)])
    cv.label([("validates the books", False)], contracts.cx + 12, 712, "start")
    cv.arrow([(api.x, 440), (312, 440), (312, pg.y)])
    cv.label([("read / write", False), ("SQLAlchemy", True)], 312, 700)
    cv.arrow([(forecast.cx, forecast.b), (forecast.cx, pg.y)])
    cv.label([("writes forecasts", False)], forecast.cx - 12, 712, "end")
    cv.arrow([(api.r, 424), (632, 424), (632, fm.cy), (fm.x, fm.cy)])
    cv.label([("document answers", False)], 626, 520, "end")

    # data in: one CSV seeds the books and lands in the volume
    cv.arrow([(csv.cx, csv.y), (csv.cx, pg.b)])
    cv.label([("seed · 8 checks", True)], csv.cx + 12, 926, "start")
    cv.arrow([(csv.cx, csv.b), (csv.cx, landing.y)])
    cv.label([("dbx-upload", True)], csv.cx + 12, 1064, "start")

    # the medallion: landing → bronze → silver → gate → gold
    for a, b in zip((landing, bronze, silver, gate), (bronze, silver, gate, gold), strict=True):
        cv.arrow([(a.r, a.cy), (b.x, a.cy)])
    cv.arrow([(workflows.cx, workflows.b), (workflows.cx, 1080)])
    cv.label([("runs the job", False)], workflows.cx + 12, 1000, "start")

    # Gold feeds the readers, read-only
    cv.arrow([(gold.cx + 48, gold.y), (gold.cx + 48, mlflow.b)])
    cv.arrow([(gold.cx - 48, gold.y), (gold.cx - 48, 508), (aibi.cx, 508), (aibi.cx, aibi.b)])
    cv.label([("reads Gold", False)], gold.cx, 960)

    # delivery
    cv.arrow([(ci.r, ci.cy), (cd.x, ci.cy)])
    cv.label([("tag v*", True)], 312, ci.cy - 12)
    cv.arrow([(cd.cx + 40, cd.y), (cd.cx + 40, 1296), (761, 1296), (761, 1272)])
    cv.label([("deploy, run, validate Gold", False)], 636, 1290)
    cv.arrow([(tf.cx + 60, tf.y), (tf.cx + 60, 1272)])
    cv.label([("schemas, volumes, job", False)], tf.cx + 72, 1302, "start")

    # cards (drawn last, over the lines)
    cv.node(team, "person", "Person", "Marketplace team", None, ["Act on the morning brief"], ["user"])
    cv.node(exports, "external", "External", "Marketplace exports", None, ["New CSVs, via the Data page"], ["file"])
    cv.node(analyst, "person", "Person", "Data analyst", None, ["Explores Gold in AI/BI, Genie"], ["user"])

    cv.node(tower, "container", "Container", "Control Tower", "React 19 · Vite · nginx",
            ["Today brief, role pages,", "imports and data contracts"], ["react", "nginx"])
    cv.node(api, "container", "Container", "Backend API", "FastAPI · 59 tests",
            ["Brief, stats, orders, imports;", "cached on a data version"], ["fastapi"])
    cv.node(forecast, "container", "Batch job", "Revenue forecast", "scikit-learn · Prophet",
            ["30-day outlook, Random", "Forest served"], ["scikitlearn", "python"])
    cv.node(contracts, "container", "Library in the API", "Data contracts", "Great Expectations 1.x",
            ["Import contract: 46 checks;", "books contract: 29"], ["shield"], dashed=True)
    cv.node(pg, "store", "Data store · system of record", "PostgreSQL 16", "11 migrations · CHECK + foreign keys",
            ["6 core tables, 1,000,000 orders, imports, contract runs and the answer log.",
             "final_price must match price × quantity × discount, within ±5 INR."], ["postgresql"])

    cv.node(aibi, "container", "Container · BI", "AI/BI and Genie", "Databricks SQL warehouse",
            ["Revenue and fulfilment", "dashboards; NL over Gold"], ["databricks"])
    cv.node(mlflow, "container", "Container · ML", "MLflow experiments", "notebook 05 · scikit-learn",
            ["Return propensity: no", "feature predicts it"], ["mlflow"])
    cv.node(fm, "external", "External", "Foundation Model API", "Databricks · gpt-oss-120b",
            ["Answers only from the", "retrieved document chunks"], ["databricks"])
    cv.node(workflows, "container", "Container · job", "Databricks Workflows", "serverless · 5 tasks",
            ["ingest → silver → gate", "→ gold → sql refresh"], ["databricks"])

    cv.node(csv, "store", "Dataset", "E-commerce CSV", None, ["1M rows, synthetic"], ["file"])

    cv.node(landing, "store", "UC volume", "Landing", "bronze/landing", ["The 1M-row CSV,", "as uploaded"], ["bucket"])
    cv.node(bronze, "store", "Delta table", "Bronze", "raw_purchases", ["COPY INTO, append-", "only, audit columns"], ["layers"])
    cv.node(silver, "store", "Delta tables", "Silver", "6 entity tables", ["Typed, trimmed; every", "rule defined once"], ["apachespark"])
    cv.node(gate, "container", "Quality gate", "DQ gate R1–R9", "Spark SQL · fail-fast",
            ["0 violations at 1M rows;", "one failure stops Gold"], ["shield"], focal=True)
    cv.node(gold, "store", "Delta · marts", "Gold", "4 marts + dimensions",
            ["Revenue reconciled to", "the source, ±1,000 INR"], ["layers"])

    cv.node(ci, "container", "CI · every PR", "GitHub Actions CI", "ci.yml · 10 jobs",
            ["Unit tests, SQL guards,", "GE run, terraform validate"], ["githubactions"])
    cv.node(cd, "container", "CD · tag v*", "GitHub Actions CD", "cd.yml · 3 jobs",
            ["Images to GHCR, compose", "smoke, Databricks job"], ["githubactions", "docker"])
    cv.node(tf, "container", "Infrastructure", "Terraform", "databricks provider",
            ["Schemas, volumes and", "the medallion job"], ["terraform"])
    cv.node(mise, "container", "Tooling", "mise + uv", "19 tasks · uv.lock",
            ["dev, seed, dbx-*, tf-*;", "no Docker needed locally"], ["uv", "terminal"])

    cv.readout(READOUT, 1248, 96)
    cv.legend(1552, [("person", "person"), ("container", "container"), ("focal", "the gate"),
                     ("store", "data store"), ("external", "external"), ("call", "call / data flow")])


VIEWS = [
    View("container", container_view, 1280, 1612, "c4 model · level 2 · containers", "How it works",
         "postgresql owns every write · databricks owns analytics, behind a fail-fast gate",
         "DataOps Lakehouse — C4 container view",
         "C4 container diagram. Operational plane (Docker Compose): the marketplace team uses the React Control "
         "Tower, which calls the FastAPI backend; marketplace exports enter through POST /imports and are gated row "
         "by row by Great Expectations contracts inside the API, which also validate the books in PostgreSQL 16, the "
         "system of record; a batch job writes revenue forecasts. The 1M-row CSV seeds PostgreSQL and is uploaded to "
         "a Unity Catalog volume. Analytical plane (Databricks): a Workflows job runs Landing, Bronze, Silver, the "
         "fail-fast DQ gate R1–R9 and Gold; Gold feeds AI/BI dashboards and Genie, explored by the data analyst, and "
         "MLflow experiments; the API asks the Foundation Model API for document answers. Delivery (GitHub): CI runs "
         "10 jobs on every pull request, CD on a v* tag deploys and validates Gold, Terraform provisions the "
         "workspace assets, and mise + uv run every task locally."),
]

if __name__ == "__main__":
    build(HERE, "DataOps-Lakehouse-for-E-commerce-Analytics", VIEWS)
