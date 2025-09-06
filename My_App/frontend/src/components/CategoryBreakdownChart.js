// src/components/CategoryBreakdownChart.js
import React, { useMemo, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

const fmtUSD = (n) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : n;

const toYYYYMM = (d) => {
  const x = new Date(d);
  return isNaN(x) ? String(d) : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};

// Make labels readable: "AMERICAN_CORDIALS_LIQUEURS" -> "American Cordials & Liqueurs"
function tidyLabel(raw = "") {
  const s = String(raw)
    .replace(/_/g, " ")
    .replace(/\s+&\s+/g, " & ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return s.length > 26 ? s.slice(0, 23) + "…" : s;
}

export default function CategoryBreakdownChart({
  history = [],
  height = 360,
  topN = 12,
  apiBase = process.env.REACT_APP_API_BASE || "/api",
  onInsightText,
  storeId,
}) {
  // 1) Build a list of months (ascending) that actually have categories
  const months = useMemo(() => {
    const rows = (Array.isArray(history) ? history : [])
      .filter((r) => r?.categories && Object.keys(r.categories).length)
      .map((r) => ({ ...r, key: toYYYYMM(r.date) }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));

    // If multiple entries for same YYYY-MM, keep the last one
    const byKey = new Map();
    for (const r of rows) byKey.set(r.key, r);
    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [history]);

  // 2) Local month index state (reset to latest whenever months change)
  const [monthIdx, setMonthIdx] = useState(Math.max(0, months.length - 1));
  useEffect(() => {
    setMonthIdx(Math.max(0, months.length - 1));
  }, [months.length]);

  const selected = months[monthIdx] || null;

  // 3) From the selected month, build chart data + AI payload
  const { latestLabel, monthKey, data, payloadForAI } = useMemo(() => {
    if (!selected) return { latestLabel: "", monthKey: "", data: [], payloadForAI: null };

    const entries = Object.entries(selected.categories || {})
      .filter(([name]) => !/^total$/i.test(name)) // drop “Total”
      .map(([name, val]) => ({
        name,
        label: tidyLabel(name),
        value: Number(val) || 0,
      }))
      .filter((d) => Number.isFinite(d.value));

    entries.sort((a, b) => b.value - a.value);
    const top = entries.slice(0, Math.max(1, topN));
    const rest = entries.slice(Math.max(1, topN));

    let otherSum = 0;
    if (rest.length) {
      otherSum = rest.reduce((s, r) => s + (r.value || 0), 0);
      top.push({ name: "__OTHER__", label: "Other", value: otherSum });
    }

    const label =
      new Date(selected.date).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      }) || String(selected.date);

    const grandTotal = entries.reduce((s, r) => s + (r.value || 0), 0);
    const payload = {
      store_id: storeId,
      month: toYYYYMM(selected.date),
      top_n: topN,
      totals: {
        grand_total: grandTotal,
        top_total: top.filter((d) => d.name !== "__OTHER__").reduce((s, r) => s + r.value, 0),
        other_total: otherSum,
      },
      categories: entries.map((e) => ({ name: e.name, value: e.value })),
    };

    return {
      latestLabel: label,
      monthKey: toYYYYMM(selected.date),
      data: top,
      payloadForAI: payload,
    };
  }, [selected, topN, storeId]);

  // 4) Ask backend for month-specific category insight; fallback if unavailable
  useEffect(() => {
    if (!onInsightText || !payloadForAI) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${apiBase}/insights/category-breakdown`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForAI),
          signal: controller.signal,
        });
        const j = await res.json().catch(() => ({}));
        if (j?.text) {
          onInsightText(j.text);
          return;
        }
      } catch {
        // ignore and use fallback
      }

      const total = payloadForAI.totals.grand_total || 0;
      const top3 = [...payloadForAI.categories].sort((a, b) => b.value - a.value).slice(0, 3);
      const bullets = [
        `Category breakdown for ${monthKey}.`,
        ...top3.map(
          (c, i) =>
            `${i + 1}. ${tidyLabel(c.name)}: ${fmtUSD(c.value)} (${
              total ? ((c.value / total) * 100).toFixed(1) : "0"
            }%)`
        ),
        `Total across categories: ${fmtUSD(total)}.`,
      ];
      onInsightText(bullets.join("\n"));
    })();

    return () => controller.abort();
  }, [apiBase, monthKey, onInsightText, payloadForAI]);

  // 5) Empty-state
  if (!data.length) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#475569",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          background: "white",
        }}
      >
        No category data available.
      </div>
    );
  }

  // 6) Header with Prev/Next month controls
  const canPrev = monthIdx > 0;
  const canNext = monthIdx < months.length - 1;

  return (
    <div
      style={{
        height,
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        background: "white",
        padding: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "6px 10px 2px",
          color: "#334155",
        }}
      >
        <button
          aria-label="Previous month"
          onClick={() => canPrev && setMonthIdx((i) => Math.max(0, i - 1))}
          disabled={!canPrev}
          style={{
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            padding: "2px 6px",
            background: canPrev ? "#fff" : "#f8fafc",
            opacity: canPrev ? 1 : 0.5,
            cursor: canPrev ? "pointer" : "default",
          }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Category Breakdown</div>
        <button
          aria-label="Next month"
          onClick={() =>
            canNext && setMonthIdx((i) => Math.min(months.length - 1, i + 1))
          }
          disabled={!canNext}
          style={{
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            padding: "2px 6px",
            background: canNext ? "#fff" : "#f8fafc",
            opacity: canNext ? 1 : 0.5,
            cursor: canNext ? "pointer" : "default",
          }}
        >
          ›
        </button>
        <div style={{ marginLeft: 8, fontSize: 14, fontWeight: 600 }}>
          • {latestLabel}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height - 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 120 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(v) =>
              typeof v === "number" ? v.toLocaleString() : v
            }
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(v) => [fmtUSD(v), "Sales"]}
            cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
          />
          <Bar dataKey="value" fill="#3182ce" radius={[4, 4, 4, 4]}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) =>
                typeof v === "number" ? v.toLocaleString() : v
              }
              style={{ fontSize: 12, fill: "#1e293b" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
