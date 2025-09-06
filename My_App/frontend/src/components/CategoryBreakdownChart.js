// src/components/CategoryBreakdownChart.js
import React, { useMemo, useEffect } from "react";
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
  return isNaN(x)
    ? String(d)
    : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
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
  storeId, // optional; forwarded to backend
}) {
  // Build dataset from the latest month that actually has a categories object
  const { latestLabel, monthKey, data, payloadForAI } = useMemo(() => {
    const rows = Array.isArray(history) ? [...history] : [];
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // Find latest and previous rows with categories
    let latest = null;
    let prev = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]?.categories && Object.keys(rows[i].categories).length) {
        if (!latest) latest = rows[i];
        else {
          prev = rows[i];
          break;
        }
      }
    }
    if (!latest)
      return { latestLabel: "", monthKey: "", data: [], payloadForAI: null };

    // Latest categories (drop "Total")
    const latestEntries = Object.entries(latest.categories || {})
      .filter(([name]) => !/^total$/i.test(name))
      .map(([name, val]) => ({
        name,
        label: tidyLabel(name),
        value: Number(val) || 0,
      }))
      .filter((d) => Number.isFinite(d.value));

    // Month sum and shares
    const monthSum =
      latestEntries.reduce((s, r) => s + (r.value || 0), 0) || 0;

    // Sort desc and keep Top N + Other
    latestEntries.sort((a, b) => b.value - a.value);
    const top = latestEntries.slice(0, Math.max(1, topN));
    const rest = latestEntries.slice(Math.max(1, topN));
    let otherSum = 0;
    if (rest.length) {
      otherSum = rest.reduce((s, r) => s + (r.value || 0), 0);
      top.push({ name: "__OTHER__", label: "Other", value: otherSum });
    }
    const withShare = top.map((d) => ({
      ...d,
      share: monthSum ? d.value / monthSum : 0,
    }));

    // Previous month (filtered like latest)
    let prevEntries = null;
    if (prev?.categories) {
      prevEntries = Object.entries(prev.categories || {})
        .filter(([name]) => !/^total$/i.test(name))
        .map(([name, val]) => ({ name, value: Number(val) || 0 }))
        .filter((d) => Number.isFinite(d.value));
    }

    const label =
      new Date(latest.date).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      }) || String(latest.date);

    const payloadForAI = {
      store_id: storeId,
      month: toYYYYMM(latest.date),
      top_n: topN,
      totals: {
        grand_total: monthSum,
        top_total: withShare
          .filter((d) => d.name !== "__OTHER__")
          .reduce((s, r) => s + r.value, 0),
        other_total: otherSum,
      },
      categories: latestEntries.map((e) => ({ name: e.name, value: e.value })),
      prev_categories: prevEntries, // may be null
    };

    return {
      latestLabel: label,
      monthKey: toYYYYMM(latest.date),
      data: withShare,
      payloadForAI,
    };
  }, [history, topN, storeId]);

  // Ask backend for category-specific AI insight (with graceful fallback)
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
        const text =
          j?.text || j?.summary || j?.insight || j?.message || "";
        if (text) {
          onInsightText(text);
          return;
        }
      } catch {
        /* ignore and fall back */
      }

      // Fallback summary (no backend / error)
      const cats = payloadForAI.categories || [];
      const total = payloadForAI.totals?.grand_total || 0;
      const top3 = [...cats].sort((a, b) => b.value - a.value).slice(0, 3);
      const top3Share =
        total ? (top3.reduce((s, d) => s + d.value, 0) / total) * 100 : 0;

      // Simple MoM mover if prev exists
      let moverLine = null;
      if (payloadForAI.prev_categories?.length) {
        const prevMap = new Map(
          payloadForAI.prev_categories.map((p) => [p.name, p.value])
        );
        let best = { name: null, delta: 0 };
        for (const c of cats) {
          const d = c.value - (prevMap.get(c.name) || 0);
          if (Math.abs(d) > Math.abs(best.delta)) best = { name: c.name, delta: d };
        }
        if (best.name) {
          const pct = total ? Math.round((Math.abs(best.delta) / total) * 1000) / 10 : 0;
          moverLine = `Biggest mover vs prior month: ${tidyLabel(
            best.name
          )} ${best.delta >= 0 ? "up" : "down"} ${fmtUSD(
            Math.abs(best.delta)
          )} (~${pct}%).`;
        }
      }

      const bullets = [
        `Category breakdown for ${monthKey}.`,
        ...top3.map(
          (c, i) =>
            `${i + 1}. ${tidyLabel(c.name)}: ${fmtUSD(c.value)} (${
              total ? ((c.value / total) * 100).toFixed(1) : "0.0"
            }%).`
        ),
        `Concentration: top 3 = ${top3Share.toFixed(1)}% of category sales.`,
        moverLine,
        `Total across categories: ${fmtUSD(total)}.`,
      ].filter(Boolean);

      onInsightText(bullets.join("\n"));
    })();

    return () => controller.abort();
  }, [apiBase, monthKey, onInsightText, payloadForAI]);

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
        No category data available for the latest month.
      </div>
    );
  }

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
          fontWeight: 600,
          fontSize: 14,
          margin: "6px 10px 2px",
          color: "#334155",
        }}
      >
        Category Breakdown • {latestLabel}
      </div>
      <ResponsiveContainer width="100%" height={height - 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 140 }}
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
            width={140}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(v, _n, payload) => {
              const pct = payload?.payload?.share
                ? ` (${(payload.payload.share * 100).toFixed(1)}%)`
                : "";
              return [`${fmtUSD(v)}${pct}`, "Sales"];
            }}
            cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
          />
          <Bar dataKey="value" fill="#3182ce" radius={[4, 4, 4, 4]}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v, _name, payload) => {
                const pct = payload?.share
                  ? ` • ${(payload.share * 100).toFixed(1)}%`
                  : "";
                return `${v.toLocaleString()}${pct}`;
              }}
              style={{ fontSize: 12, fill: "#1e293b" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
