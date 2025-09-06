# backend/routes/explain_category.py
from flask import Blueprint, request, jsonify
# Reuse whatever you use in explain_forecast to call the LLM:
# from .llm import complete   # <- example helper

category_ai_bp = Blueprint("category_ai", __name__, url_prefix="/api")

@category_ai_bp.post("/insights/category")
def category_insight():
    js = request.get_json(force=True) or {}
    month = js.get("month")  # e.g., "2023-07"
    items = js.get("items", [])  # [{name: "AMERICAN_VODKAS", value: 105471}, ...]

    # Build a concise prompt (keep tokens small for speed/cost)
    pairs = ", ".join(f"{i['name']}=${round(i['value']):,}" for i in items[:20])
    prompt = f"""You are a retail analyst. Write 4–6 short bullets about the category breakdown for {month}.
Use plain English, no tables. Include: top category & share, top-3 share vs long tail, notable rise/drop if obvious, and 1–2 next actions.
Data: {pairs}."""

    # text = complete(prompt, max_tokens=350)      # <- your helper
    # If you don’t have a helper, temporarily return a deterministic summary:
    text = f"* Top category and shares based on: {pairs}\n* (Hook this up to your LLM helper.)"

    return jsonify({"text": text})
