# backend/routes/forecast.py
from __future__ import annotations

from flask import Blueprint, current_app, jsonify
from typing import List, Dict, Optional
import pandas as pd
from copy import deepcopy

from .data_access import _ensure_required_objects

forecast_bp = Blueprint("forecast", __name__)

def _label(dt: pd.Timestamp) -> str:
    return dt.strftime("%b %y")

def _find_store_col(df: pd.DataFrame) -> Optional[str]:
    aliases = ["Store Number", "store_id", "Store", "Store #", "StoreNumber",
               "Location ID", "LocationID", "location_id", "store"]
    return next((c for c in aliases if c in df.columns), None)

def _find_total_col(df: pd.DataFrame) -> Optional[str]:
    aliases = ["Total_Sales", "Total Sales", "total_sales", "Sales"]
    return next((c for c in aliases if c in df.columns), None)

def _category_value_cols(df: pd.DataFrame) -> list[str]:
    """
    Wide format support: category columns like 'American_Vodkas_Sales'.
    We exclude the total column.
    """
    low = {c.lower(): c for c in df.columns}
    total = _find_total_col(df)
    cols = [c for c in df.columns if c.lower().endswith("_sales")]
    if total:
        cols = [c for c in cols if c != total]
    return cols

def _category_name_col(df: pd.DataFrame) -> Optional[str]:
    """
    Long format support: a column with the category name.
    """
    aliases = ["Category", "Category Name", "category", "Department", "Dept"]
    return next((c for c in aliases if c in df.columns), None)

@forecast_bp.route("/api/forecast/<int:store_id>", methods=["GET"])
def get_forecast_for_store(store_id: int):
    try:
        _ensure_required_objects(current_app.config)
    except ValueError as e:
        return jsonify({"error": str(e)}), 500

    df: pd.DataFrame = current_app.config.get("df")
    model = current_app.config.get("model")
    features: List[str] = list(current_app.config.get("model_features", []))

    if df is None or model is None:
        return jsonify({"error": "Required data not loaded"}), 500

    log = current_app.logger

    try:
        df = df.copy()

        # ---- normalize key columns ----
        store_col = _find_store_col(df)
        if not store_col:
            log.warning("No recognizable store column. Columns=%s", list(df.columns)[:20])
            resp = jsonify({"history": [], "forecast": []})
            resp.headers["Cache-Control"] = "no-store"
            return resp, 200
        if store_col != "Store Number":
            df.rename(columns={store_col: "Store Number"}, inplace=True)

        total_col = _find_total_col(df)
        if not total_col:
            log.warning("No recognizable total-sales column. Columns=%s", list(df.columns)[:20])
            resp = jsonify({"history": [], "forecast": []})
            resp.headers["Cache-Control"] = "no-store"
            return resp, 200
        if total_col != "Total_Sales":
            df.rename(columns={total_col: "Total_Sales"}, inplace=True)

        # coerce types
        df["Store Number"] = pd.to_numeric(df["Store Number"], errors="coerce")
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df.dropna(subset=["Store Number", "Date"], inplace=True)
        df["Store Number"] = df["Store Number"].astype(int)

        # scope to this store and time window
        store_df = df[df["Store Number"] == int(store_id)].sort_values("Date")
        if store_df.empty:
            log.info("No rows for store %s after normalization", store_id)
            resp = jsonify({"history": [], "forecast": []})
            resp.headers["Cache-Control"] = "no-store"
            return resp, 200
        store_df = store_df[store_df["Date"].dt.year >= 2020]

        # Month bucket
        store_df["YearMonth"] = store_df["Date"].dt.to_period("M")
        monthly_total = (
            store_df.groupby("YearMonth", as_index=False)["Total_Sales"]
            .sum()
            .rename(columns={"Total_Sales": "total_sales"})
            .sort_values("YearMonth")
        )

        # Category sources
        wide_cols = _category_value_cols(store_df)
        name_col = _category_name_col(store_df)

        def month_categories(period_m: pd.Period) -> Dict[str, float]:
            """Return a NEW dict of categories for this store+month."""
            mdf = store_df[store_df["YearMonth"] == period_m]
            if mdf.empty:
                return {}

            if name_col and ("Sales" in mdf.columns or "sales" in mdf.columns):
                val_col = "Sales" if "Sales" in mdf.columns else "sales"
                cat = (
                    mdf.groupby(name_col, dropna=False)[val_col]
                    .sum()
                    .sort_values(ascending=False)
                )
                return {str(k): float(v) for k, v in cat.items()}

            if wide_cols:
                sums = mdf[wide_cols].sum(numeric_only=True)
                return {c.replace("_Sales", ""): float(sums.get(c, 0.0)) for c in wide_cols}

            # No category data available
            return {}

        # Build history (last 5 months)
        history: List[Dict] = []
        for _, row in monthly_total.iterrows():
            period_m: pd.Period = row["YearMonth"]
            dt = period_m.to_timestamp()  # beginning of month
            cats_dict = month_categories(period_m)
            history.append({
                "date": dt.strftime("%Y-%m-%d"),
                "label": _label(dt),
                "total_sales": round(float(row["total_sales"]), 2),
                "source": "history",
                # deepcopy to avoid accidental sharing/mutation across responses
                "categories": deepcopy(cats_dict),
            })

        history = sorted(history, key=lambda x: x["date"])[-5:]
        if len(history) < 2:
            log.info("Store %s has <2 months after grouping; returning empty forecast", store_id)
            resp = jsonify({"history": [], "forecast": []})
            resp.headers["Cache-Control"] = "no-store"
            return resp, 200

        # Forecast 1 month ahead
        latest_dt = pd.to_datetime(history[-1]["date"])
        latest_full = store_df.iloc[-1:].copy()
        for col in features:
            if col not in latest_full.columns:
                latest_full[col] = 0.0

        yhat = float(model.predict(latest_full[features])[0])
        next_dt = (latest_dt + pd.DateOffset(months=1)).normalize()

        forecast_point = {
            "date": next_dt.strftime("%Y-%m-%d"),
            "label": _label(next_dt),
            "predicted": round(yhat, 2),
            "sales": round(yhat, 2),
            "source": "forecast",
        }

        payload = {"history": history, "forecast": [forecast_point]}
        log.info(
            "Forecast payload for store %s -> months=%d, wide_cols=%d, name_col=%s",
            store_id, len(history), len(wide_cols), name_col or "-"
        )

        resp = jsonify(payload)
        resp.headers["Cache-Control"] = "no-store"
        return resp, 200

    except Exception:
        log.exception("Forecast route error for store %s", store_id)
        resp = jsonify({"error": "Failed to generate forecast"})
        resp.headers["Cache-Control"] = "no-store"
        return resp, 500
