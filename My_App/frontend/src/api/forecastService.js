import { API_BASE } from "./base";

/** API_BASE already includes `/api` */
const join = (path) => `${API_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- normalization helpers ---------- */
const pickNumber = (p) => {
  const raw = p?.value ?? p?.total ?? p?.sales ?? p?.amount ?? p?.y ?? 0;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return Number.isFinite(n) ? n : 0;
};
const normDate = (s) => String(s || "").slice(0, 10);

const normStyle = (s) => {
  const v = String(s || "").toLowerCase();
  if (["bullets", "narrative", "actions", "action plan", "actionplan"].includes(v)) {
    if (v.startsWith("action")) return "actions";
    return v;
  }
  return "narrative";
};

// map new labels → server’s legacy grades
const mapLevelForServer = (lvl) => {
  const v = String(lvl || "").toLowerCase();
  if (v === "simple" || v === "6th") return "6th";
  if (v === "balanced" || v === "9th" || v === "default") return "9th";
  if (v === "advanced" || v === "12th") return "12th";
  return "pro";
};

/* ---------- payload + caching ---------- */
const buildPayload = (rawTimeline, focus, opts = {}) => {
  const timeline = (Array.isArray(rawTimeline) ? rawTimeline : [])
    .map((p) => ({
      date: normDate(p?.date),
      value: pickNumber(p),
      source: p?.source || "actual",
    }))
    .filter((p) => p.date && Number.isFinite(p.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const payload = { view: "total", timeline };

  if (focus && focus.date) {
    payload.focus = {
      date: normDate(focus.date),
      value: pickNumber(focus),
      source: focus.source || "actual",
    };
  }

  // style aliases
  if (opts?.explainStyle) {
    const v = normStyle(opts.explainStyle);
    payload.explainStyle = v;
    payload.style = v;
    payload.format = v;
  }
  // level aliases
  if (opts?.readingLevel) {
    const v = mapLevelForServer(opts.readingLevel);
    payload.readingLevel = v;
    payload.level = v;
    payload.audience = v;
  }

  return payload;
};

const keyOf = (payload) => JSON.stringify(payload);

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _cache = new Map();    // key -> { ts, summary }
const _inflight = new Map(); // key -> Promise<{summary}>

/* ---------- public APIs ---------- */

/** GET /api/forecast/:store_id */
export async function fetchForecast(storeId) {
  const res = await fetch(join(`forecast/${storeId}`));
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return res.json();
}

/**
 * POST /api/explain_forecast
 * - Normalizes input
 * - Adds style/level aliases + query params for legacy servers
 * - Caches responses and coalesces in-flight requests
 * - Retries once on 429 with backoff
 */
export async function explainForecast(rawTimeline, focus, opts = {}) {
  const payload = buildPayload(rawTimeline, focus, opts);
  if (payload.timeline.length === 0) return { summary: "" };

  const key = keyOf(payload);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { summary: hit.summary, fromCache: true };

  if (_inflight.has(key)) return _inflight.get(key);

  // also put style/level in query string for older handlers
  const qs = new URLSearchParams();
  if (payload.style) qs.set("style", payload.style);
  if (payload.level) qs.set("level", payload.level);
  const url = qs.toString() ? `explain_forecast?${qs}` : "explain_forecast";

  const exec = (async () => {
    let attempt = 0;
    let outSummary = "";

    while (attempt < 2) {
      attempt += 1;

      const res = await fetch(join(url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: opts?.signal,
      });

      let json = null;
      try { json = await res.json(); } catch {}

      const is429 = res.status === 429 || (json && /rate limit/i.test(JSON.stringify(json)));
      if (is429 && attempt < 2) {
        const m = /try again in\s+([\d.]+)s/i.exec(json?.error?.message || "");
        const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 1600;
        await sleep(waitMs);
        continue;
      }

      outSummary = typeof json === "string" ? json : (json?.summary ?? "");
      break;
    }

    _cache.set(key, { ts: Date.now(), summary: String(outSummary || "") });
    return { summary: String(outSummary || "") };
  })();

  _inflight.set(key, exec);
  try {
    return await exec;
  } finally {
    _inflight.delete(key);
  }
}
