"""
Generate adviser-ready PDF transition report (landscape, Auour branding).
Uses ReportLab for layout, tables, and pagination.
All dimensions in points (1 inch = 72 pt).
"""
from io import BytesIO
from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import date
from collections import defaultdict
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Auour brand palette
AUOUR_NAVY = colors.HexColor("#0f2942")
AUOUR_GREEN = colors.HexColor("#059669")
AUOUR_AMBER = colors.HexColor("#d97706")
AUOUR_RED = colors.HexColor("#dc2626")
AUOUR_GRAY = colors.HexColor("#6b7280")
FOOTER_TEXT = "For Investment Professional Use Only. Not for distribution to the public."

# Landscape letter: width=792pt. Margins 0.5" each side => content width = 792 - 72 = 720 pt
CONTENT_WIDTH_PT = 792 - 72


def _float(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _str(v: Any) -> str:
    if v is None:
        return "—"
    return str(v).strip() or "—"


def _xml_safe(v: Any) -> str:
    """Escape for ReportLab Paragraph mini-HTML (&, <, > break parsing if unescaped)."""
    if v is None:
        return "—"
    t = str(v).strip()
    if not t:
        return "—"
    return escape(t)


def _sell_grade(so: Dict[str, Any]) -> int:
    """JSON may have grade: null; dict.get('grade', 2) returns None in that case."""
    g = so.get("grade")
    if g is None:
        return 2
    try:
        return int(g)
    except (TypeError, ValueError):
        return 2


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    """Convenience paragraph wrapper so table cells wrap instead of overflowing."""
    return Paragraph(_xml_safe(text), style)


def build_transition_report_pdf(
    prospect_name: str,
    strategy_name: str,
    report_date: Optional[date] = None,
    total_value: float = 0.0,
    total_gains: float = 0.0,
    total_losses: float = 0.0,
    net_gain_loss: float = 0.0,
    pre_unrealized_gain_loss: float = 0.0,
    post_unrealized_gain_loss: float = 0.0,
    cash_residual: float = 0.0,
    additional_text: Optional[str] = None,
    pre_holdings: Optional[List[Dict[str, Any]]] = None,
    post_holdings: Optional[List[Dict[str, Any]]] = None,
    sell_orders: Optional[List[Dict[str, Any]]] = None,
    buy_orders: Optional[List[Dict[str, Any]]] = None,
    equivalent_usage: Optional[List[Dict[str, Any]]] = None,
    asset_class_order: Optional[List[str]] = None,
    target_positions: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """
    Build a landscape PDF report. All numeric values can be float or Decimal.
    pre_holdings/post_holdings: list of dicts with ticker/model_ticker, asset_class, value, optional ticker (legacy).
    sell_orders: list of dicts with ticker, value, gain_loss, grade.
    buy_orders: list of dicts with model_ticker, value, asset_class.
    equivalent_usage: legacy→model pairs used in transition; in_product_equivalents flags GE_Alt row.
    Side pocket rows are listed separately; allocation tables exclude Side Pocket asset class.
    """
    report_date = report_date or date.today()
    pre_holdings = pre_holdings or []
    post_holdings = post_holdings or []
    sell_orders = sell_orders or []
    buy_orders = buy_orders or []
    equivalent_usage_list = list(equivalent_usage or [])
    asset_class_order = list(asset_class_order or [])
    target_positions = list(target_positions or [])
    pre_alloc = [h for h in pre_holdings if _str(h.get("asset_class")) != "Side Pocket"]
    post_alloc = [h for h in post_holdings if _str(h.get("asset_class")) != "Side Pocket"]

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(letter),
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.9 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=14,
        textColor=AUOUR_NAVY,
        spaceAfter=2,
        alignment=TA_CENTER,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=AUOUR_NAVY,
        spaceAfter=4,
        spaceBefore=8,
    )
    normal_style = styles["Normal"]

    story = []

    # ----- Header -----
    story.append(Paragraph("Auour Investments Transition Report", title_style))
    story.append(Paragraph(f"<b>Prospect:</b> {_xml_safe(prospect_name)}", normal_style))
    story.append(Paragraph(f"<b>Strategy:</b> {_xml_safe(strategy_name)}", normal_style))
    story.append(Paragraph(f"<b>Report Date:</b> {_xml_safe(report_date.strftime('%B %d, %Y'))}", normal_style))
    story.append(Spacer(1, 12))

    # ----- Section 1: Portfolio Impact Summary -----
    story.append(Paragraph("1. Portfolio Impact Summary", heading_style))

    total_gains_fmt = f"${total_gains:,.0f}" if total_gains else "$0"
    total_losses_fmt = f"${total_losses:,.0f}" if total_losses else "$0"
    net_fmt = f"${net_gain_loss:,.0f}" if net_gain_loss else "$0"
    pre_unrealized_fmt = f"${pre_unrealized_gain_loss:,.0f}" if pre_unrealized_gain_loss else "$0"
    post_unrealized_fmt = f"${post_unrealized_gain_loss:,.0f}" if post_unrealized_gain_loss else "$0"

    summary_data = [
        [_p("Metric", normal_style), _p("Value", normal_style), _p("Notes", normal_style)],
        [_p("Net realized gain/loss", normal_style), _p(net_fmt, normal_style), _p("Tax realization from proposed trades", normal_style)],
        [_p("Unrealized gain/loss (Current portfolio)", normal_style), _p(pre_unrealized_fmt, normal_style), _p("Unrealized amount before transition", normal_style)],
        [_p("Unrealized gain/loss (Proposed portfolio)", normal_style), _p(post_unrealized_fmt, normal_style), _p("Unrealized amount after proposed trades", normal_style)],
    ]
    summary_table = Table(summary_data, colWidths=[2.1 * inch, 1.1 * inch, 2.3 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 6))
    if additional_text:
        paragraphs = [p.strip() for p in str(additional_text).split("\n\n") if p.strip()]
        for p in paragraphs:
            story.append(Paragraph(_xml_safe(p), normal_style))
            story.append(Spacer(1, 4))

    story.append(PageBreak())

    # ----- Section 2: Target model portfolio (per ticker) -----
    story.append(Paragraph("2. Target Model Portfolio", heading_style))
    if target_positions:
        by_ac: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for p in target_positions:
            by_ac[_str(p.get("asset_class"))].append(p)
        ac_order = sorted(
            by_ac.keys(),
            key=lambda ac: -max(_float(x.get("target_allocation")) for x in by_ac[ac]),
        )
        target_rows = [["Model Ticker", "Asset Class", "Target %", "Drift %"]]
        subtotal_row_indexes: List[int] = []
        for ac in ac_order:
            items = sorted(by_ac[ac], key=lambda x: -_float(x.get("target_allocation")))
            for p in items:
                target_rows.append([
                    _xml_safe(_str(p.get("model_ticker"))[:18]),
                    _xml_safe(ac[:18]),
                    f"{_float(p.get('target_allocation')):.2f}%",
                    f"±{_float(p.get('drift_percentage')):.2f}%",
                ])
            if len(items) > 1:
                sub_target = sum(_float(p.get("target_allocation")) for p in items)
                target_rows.append([f"{ac} subtotal", "", f"{sub_target:.2f}%", ""])
                subtotal_row_indexes.append(len(target_rows) - 1)
        target_rows.append(["TOTAL", "", "100.00%", ""])
        target_table = Table(
            target_rows,
            colWidths=[
                CONTENT_WIDTH_PT * 0.28,
                CONTENT_WIDTH_PT * 0.32,
                CONTENT_WIDTH_PT * 0.20,
                CONTENT_WIDTH_PT * 0.20,
            ],
            repeatRows=1,
        )
        target_styles = [
            ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (1, -1), "LEFT"),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]
        for idx in subtotal_row_indexes:
            target_styles.append(("FONTNAME", (0, idx), (-1, idx), "Helvetica-Bold"))
            target_styles.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#eef2ff")))
        target_styles.append(("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"))
        target_styles.append(("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e5e7eb")))
        target_table.setStyle(TableStyle(target_styles))
        story.append(target_table)
    else:
        story.append(Paragraph("Target portfolio not available for this result.", normal_style))
    story.append(Spacer(1, 8))
    story.append(PageBreak())

    # ----- Section 3: Current vs proposed (side-by-side condensed tables) -----
    story.append(Paragraph("3. Current vs. Proposed Portfolio by Asset Class", heading_style))

    def build_rows_with_asset_subtotals(
        rows: List[Dict[str, Any]],
        side: str,
        portfolio_total: float,
    ) -> tuple[List[List[str]], List[int]]:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for r in rows:
            grouped[_str(r.get("asset_class"))].append(r)

        order_index = {name: idx for idx, name in enumerate(asset_class_order)}

        def asset_class_sort_key(ac: str):
            ac_norm = (ac or "").strip()
            if ac_norm in {"Side Pocket", "Forced Sale"}:
                return (2, 9999, ac_norm)
            if ac in order_index:
                return (0, order_index[ac], ac)
            # Keep non-model classes after model-driven classes.
            return (1, 9999, ac_norm)

        out: List[List[str]] = []
        subtotal_row_indexes: List[int] = []
        for asset_class in sorted(grouped.keys(), key=asset_class_sort_key):
            items = grouped[asset_class]
            for h in items:
                ticker = _str(h.get("ticker")) if side == "current" else _str(h.get("ticker") or h.get("model_ticker"))
                out.append([
                    _xml_safe(ticker[:14]),
                    _xml_safe(asset_class[:16]),
                    f"{_float(h.get('value')):,.0f}",
                    f"{_float(h.get('unrealized_gain_loss')):,.0f}",
                    f"{((_float(h.get('value')) / portfolio_total * 100) if portfolio_total else 0.0):.1f}%",
                ])
            ac_val = sum(_float(h.get("value")) for h in items)
            ac_unreal = sum(_float(h.get("unrealized_gain_loss")) for h in items)
            ac_pct = (ac_val / portfolio_total * 100) if portfolio_total else 0.0
            out.append([f"{asset_class} subtotal", "", f"{ac_val:,.0f}", f"{ac_unreal:,.0f}", f"{ac_pct:.1f}%"])
            subtotal_row_indexes.append(len(out) - 1)
        return out, subtotal_row_indexes

    legacy_total_val = sum(_float(h.get("value")) for h in pre_holdings) or 1.0
    proposed_total_val = sum(_float(h.get("value")) for h in post_holdings) or 1.0

    def fmt_pct_blank(value: float) -> str:
        return "" if abs(value) < 0.05 else f"{value:.1f}%"

    legacy_rows, legacy_subtotal_idx_local = build_rows_with_asset_subtotals(
        pre_holdings, side="current", portfolio_total=legacy_total_val
    )
    legacy_total_val = sum(_float(h.get("value")) for h in pre_holdings)
    legacy_total_unreal = sum(_float(h.get("unrealized_gain_loss")) for h in pre_holdings)
    legacy_rows.append(["TOTAL (100.0%)", "", f"{legacy_total_val:,.0f}", f"{legacy_total_unreal:,.0f}", "100.0%"])

    total_unreal = sum(_float(h.get("unrealized_gain_loss")) for h in post_holdings)

    proposed_rows, proposed_subtotal_idx_local = build_rows_with_asset_subtotals(
        post_holdings, side="proposed", portfolio_total=proposed_total_val
    )
    proposed_rows.append(["TOTAL (100.0%)", "", f"{proposed_total_val:,.0f}", f"{total_unreal:,.0f}", "100.0%"])

    combined_rows = [
        [
            "Current (includes side pocket)", "", "", "",
            "",
            "",
            "Proposed", "", "", "", ""
        ],
        [
            "Ticker", "Asset Class", "Value ($)", "Unrealized ($)", "% Total",
            "",
            "Ticker", "Asset Class", "Value ($)", "Unrealized ($)", "% Total"
        ],
    ]
    # Align rows by asset-class blocks for clearer side-by-side comparison.
    def group_rows_by_asset_class(rows: List[Dict[str, Any]], side: str) -> Dict[str, List[List[str]]]:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for r in rows:
            grouped[_str(r.get("asset_class"))].append(r)
        out: Dict[str, List[List[str]]] = {}
        for ac, items in grouped.items():
            ac_rows: List[List[str]] = []
            for h in items:
                ticker = _str(h.get("ticker")) if side == "current" else _str(h.get("ticker") or h.get("model_ticker"))
                val = _float(h.get("value"))
                unreal = _float(h.get("unrealized_gain_loss"))
                pct = (val / (legacy_total_val if side == "current" else proposed_total_val) * 100) if (legacy_total_val if side == "current" else proposed_total_val) else 0.0
                ac_rows.append([_xml_safe(ticker[:14]), _xml_safe(ac[:16]), f"{val:,.0f}", f"{unreal:,.0f}", fmt_pct_blank(pct)])
            ac_val = sum(_float(h.get("value")) for h in items)
            ac_unreal = sum(_float(h.get("unrealized_gain_loss")) for h in items)
            ac_pct = (ac_val / (legacy_total_val if side == "current" else proposed_total_val) * 100) if (legacy_total_val if side == "current" else proposed_total_val) else 0.0
            ac_rows.append([f"{ac} subtotal", "", f"{ac_val:,.0f}", f"{ac_unreal:,.0f}", fmt_pct_blank(ac_pct)])
            out[ac] = ac_rows
        return out

    current_grouped = group_rows_by_asset_class(pre_holdings, "current")
    proposed_grouped = group_rows_by_asset_class(post_holdings, "proposed")
    order_index = {name: i for i, name in enumerate(asset_class_order)}
    all_asset_classes = sorted(
        set(list(current_grouped.keys()) + list(proposed_grouped.keys())),
        key=lambda ac: (
            2 if ac in {"Side Pocket", "Forced Sale"} else (0 if ac in order_index else 1),
            order_index.get(ac, 9999),
            ac,
        ),
    )
    for ac in all_asset_classes:
        left_rows = current_grouped.get(ac, [])
        right_rows = proposed_grouped.get(ac, [])
        max_rows = max(len(left_rows), len(right_rows))
        for i in range(max_rows):
            l = left_rows[i] if i < len(left_rows) else ["", "", "", "", ""]
            p = right_rows[i] if i < len(right_rows) else ["", "", "", "", ""]
            combined_rows.append(l + [""] + p)

    col_w = [
        CONTENT_WIDTH_PT * 0.10, CONTENT_WIDTH_PT * 0.10, CONTENT_WIDTH_PT * 0.07, CONTENT_WIDTH_PT * 0.07, CONTENT_WIDTH_PT * 0.05,
        CONTENT_WIDTH_PT * 0.03,
        CONTENT_WIDTH_PT * 0.10, CONTENT_WIDTH_PT * 0.10, CONTENT_WIDTH_PT * 0.07, CONTENT_WIDTH_PT * 0.07, CONTENT_WIDTH_PT * 0.05,
    ]
    combined_table = Table(combined_rows, colWidths=col_w, repeatRows=2)
    combined_styles = [
        ("SPAN", (0, 0), (4, 0)),
        ("SPAN", (6, 0), (10, 0)),
        ("BACKGROUND", (0, 0), (4, 1), AUOUR_NAVY),
        ("BACKGROUND", (6, 0), (10, 1), AUOUR_NAVY),
        ("BACKGROUND", (5, 0), (5, -1), colors.white),
        ("TEXTCOLOR", (0, 0), (4, 1), colors.white),
        ("TEXTCOLOR", (6, 0), (10, 1), colors.white),
        ("FONTNAME", (0, 0), (10, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (10, -1), 5.8),
        ("ALIGN", (0, 0), (4, 1), "CENTER"),
        ("ALIGN", (6, 0), (10, 1), "CENTER"),
        ("ALIGN", (0, 2), (1, -1), "LEFT"),
        ("ALIGN", (6, 2), (7, -1), "LEFT"),
        ("ALIGN", (2, 2), (4, -1), "RIGHT"),
        ("ALIGN", (8, 2), (10, -1), "RIGHT"),
        ("VALIGN", (0, 0), (10, -1), "MIDDLE"),
        ("GRID", (0, 0), (4, -1), 0.5, colors.grey),
        ("GRID", (6, 0), (10, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 2), (4, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("ROWBACKGROUNDS", (6, 2), (10, -1), [colors.white, colors.HexColor("#f9fafb")]),
        # Condensed spacing for side-by-side table rows
        ("TOPPADDING", (0, 0), (10, -1), 1),
        ("BOTTOMPADDING", (0, 0), (10, -1), 1),
        ("LEFTPADDING", (0, 0), (10, -1), 2),
        ("RIGHTPADDING", (0, 0), (10, -1), 2),
        ("LEADING", (0, 0), (10, -1), 6),
    ]

    # Emphasize subtotal rows (bold + subtle shading) on both sides.
    # Local index -> combined index: +2 for header rows.
    # Style any subtotal rows by label matching for each side.
    for row_idx in range(2, len(combined_rows)):
        left_label = str(combined_rows[row_idx][0] or "")
        right_label = str(combined_rows[row_idx][6] or "")
        if left_label.endswith(" subtotal"):
            combined_styles.append(("FONTNAME", (0, row_idx), (4, row_idx), "Helvetica-Bold"))
            combined_styles.append(("BACKGROUND", (0, row_idx), (4, row_idx), colors.HexColor("#eef2ff")))
        if right_label.endswith(" subtotal"):
            combined_styles.append(("FONTNAME", (6, row_idx), (10, row_idx), "Helvetica-Bold"))
            combined_styles.append(("BACKGROUND", (6, row_idx), (10, row_idx), colors.HexColor("#eef2ff")))

    # Emphasize total rows.
    legacy_total_row = len(legacy_rows) - 1 + 2
    proposed_total_row = len(proposed_rows) - 1 + 2
    combined_styles.append(("FONTNAME", (0, legacy_total_row), (4, legacy_total_row), "Helvetica-Bold"))
    combined_styles.append(("BACKGROUND", (0, legacy_total_row), (4, legacy_total_row), colors.HexColor("#e5e7eb")))
    combined_styles.append(("FONTNAME", (6, proposed_total_row), (10, proposed_total_row), "Helvetica-Bold"))
    combined_styles.append(("BACKGROUND", (6, proposed_total_row), (10, proposed_total_row), colors.HexColor("#e5e7eb")))

    # Asset-class weight summary (no individual positions)
    story.append(Paragraph("Current vs Proposed Asset Class Weights", heading_style))
    current_by_ac: Dict[str, float] = defaultdict(float)
    proposed_by_ac: Dict[str, float] = defaultdict(float)
    for h in pre_holdings:
        current_by_ac[_str(h.get("asset_class"))] += _float(h.get("value"))
    for h in post_holdings:
        proposed_by_ac[_str(h.get("asset_class"))] += _float(h.get("value"))

    all_asset_classes = sorted(set(list(current_by_ac.keys()) + list(proposed_by_ac.keys())), key=lambda ac: (
        2 if ac in {"Side Pocket", "Forced Sale"} else (0 if ac in {name for name in asset_class_order} else 1),
        {name: i for i, name in enumerate(asset_class_order)}.get(ac, 9999),
        ac,
    ))

    # Add a summary line for individual securities (side pocket + forced sale).
    current_individual = current_by_ac.get("Side Pocket", 0.0) + current_by_ac.get("Forced Sale", 0.0)
    proposed_individual = proposed_by_ac.get("Side Pocket", 0.0) + proposed_by_ac.get("Forced Sale", 0.0)

    weight_rows = [["Asset Class", "Current %", "Proposed %"]]
    for ac in all_asset_classes:
        cur_pct = (current_by_ac.get(ac, 0.0) / legacy_total_val * 100) if legacy_total_val else 0.0
        prop_pct = (proposed_by_ac.get(ac, 0.0) / proposed_total_val * 100) if proposed_total_val else 0.0
        weight_rows.append([_xml_safe(ac), fmt_pct_blank(cur_pct), fmt_pct_blank(prop_pct)])
    weight_rows.append([
        "Individual Securities",
        fmt_pct_blank((current_individual / legacy_total_val * 100) if legacy_total_val else 0.0),
        fmt_pct_blank((proposed_individual / proposed_total_val * 100) if proposed_total_val else 0.0),
    ])

    weights_table = Table(
        weight_rows,
        colWidths=[CONTENT_WIDTH_PT * 0.56, CONTENT_WIDTH_PT * 0.22, CONTENT_WIDTH_PT * 0.22],
        repeatRows=1,
    )
    weights_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 0), (2, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(weights_table)
    story.append(Spacer(1, 8))
    story.append(PageBreak())

    combined_table.setStyle(TableStyle(combined_styles))
    story.append(combined_table)
    story.append(Paragraph("Totals are rounded to whole dollars; small rounding differences may occur.", normal_style))
    story.append(Spacer(1, 8))

    # ----- Section 4: Trade Order Execution List (side-by-side sells/buys) -----
    story.append(PageBreak())
    story.append(Paragraph("4. Trade Order Execution List", heading_style))

    def sell_reasoning(grade: int) -> str:
        if grade == 0:
            return "Liquidated Grade 0 (Model) asset"
        if grade == 1:
            return "Liquidated Grade 1 equivalent"
        return "Liquidated Grade 2 asset"

    sell_rows = [["Ticker", "Amount ($)", "Reasoning"]]
    for so in sell_orders:
        sell_rows.append([
            _xml_safe(_str(so.get("ticker"))[:18]),
            f"{_float(so.get('value')):,.0f}",
            sell_reasoning(_sell_grade(so)),
        ])
    if len(sell_rows) == 1:
        sell_rows.append(["—", "—", "No sells"])

    buy_rows = [["Ticker", "Amount ($)", "Reasoning"]]
    for bo in buy_orders:
        buy_rows.append([
            _xml_safe(_str(bo.get("model_ticker"))[:18]),
            f"{_float(bo.get('value')):,.0f}",
            _xml_safe(f"Rebalance to {_str(bo.get('asset_class'))}"[:30]),
        ])
    if len(buy_rows) == 1:
        buy_rows.append(["—", "—", "No buys"])

    half = (CONTENT_WIDTH_PT - 12) / 2
    side_col_widths = [half * 0.28, half * 0.22, half * 0.50]
    sells_table = Table(sell_rows, colWidths=side_col_widths, repeatRows=1)
    buys_table = Table(buy_rows, colWidths=side_col_widths, repeatRows=1)

    shared_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (2, 0), (2, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]
    sells_table.setStyle(TableStyle(shared_styles + [("TEXTCOLOR", (0, 1), (0, -1), AUOUR_RED)]))
    buys_table.setStyle(TableStyle(shared_styles + [("TEXTCOLOR", (0, 1), (0, -1), AUOUR_GREEN)]))

    trades_side_by_side = Table(
        [[
            [Paragraph("Sells", heading_style), sells_table],
            [Paragraph("Buys", heading_style), buys_table],
        ]],
        colWidths=[half, half],
    )
    trades_side_by_side.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(trades_side_by_side)

    # ----- Section 5: Equivalent mappings (proposal vs GE_Alt) -----
    def _equiv_source(row: Dict[str, Any]) -> str:
        if row.get("mapping_source"):
            return str(row["mapping_source"])
        if row.get("in_product_equivalents"):
            return "ge_alt"
        if _str(row.get("legacy_ticker")).upper().strip() == "CASH":
            return "cash"
        return "not_in_ge_alt"

    proposal_only = [
        r for r in equivalent_usage_list
        if _equiv_source(r) in ("manual", "not_in_ge_alt")
    ]
    ge_alt_rows = [r for r in equivalent_usage_list if _equiv_source(r) == "ge_alt"]

    if equivalent_usage_list:
        story.append(Spacer(1, 10))
        story.append(Paragraph("5. Product Equivalent Mappings", heading_style))
        if proposal_only:
            story.append(Paragraph(
                f"<b>Action required:</b> {len(proposal_only)} mapping(s) used in this proposal "
                "are <b>not</b> in the strategy product equivalents file. Add these pairs in "
                "Admin → Product Equivalents or confirm the manual mapping was intentional.",
                normal_style,
            ))
            story.append(Spacer(1, 4))
            action_rows = [["Legacy", "Model", "Grade", "How mapped"]]
            source_labels = {
                "manual": "Set on proposal (manual)",
                "not_in_ge_alt": "Not in alt file",
            }
            for row in proposal_only:
                src = _equiv_source(row)
                action_rows.append([
                    _xml_safe(_str(row.get("legacy_ticker"))[:14]),
                    _xml_safe(_str(row.get("model_ticker"))[:14]),
                    _str(row.get("grade")),
                    source_labels.get(src, src),
                ])
            action_table = Table(
                action_rows,
                colWidths=[
                    CONTENT_WIDTH_PT * 0.22,
                    CONTENT_WIDTH_PT * 0.22,
                    CONTENT_WIDTH_PT * 0.10,
                    CONTENT_WIDTH_PT * 0.46,
                ],
                repeatRows=1,
            )
            action_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), AUOUR_AMBER),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#fffbeb"), colors.white]),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(action_table)
            story.append(Spacer(1, 6))
        if ge_alt_rows:
            story.append(Paragraph(
                f"Mappings from product equivalents file ({len(ge_alt_rows)}):",
                normal_style,
            ))
            ge_rows = [["Legacy", "Model", "Grade"]]
            for row in ge_alt_rows:
                ge_rows.append([
                    _xml_safe(_str(row.get("legacy_ticker"))[:18]),
                    _xml_safe(_str(row.get("model_ticker"))[:18]),
                    _str(row.get("grade")),
                ])
            ge_table = Table(
                ge_rows,
                colWidths=[CONTENT_WIDTH_PT * 0.34, CONTENT_WIDTH_PT * 0.34, CONTENT_WIDTH_PT * 0.12],
                repeatRows=1,
            )
            ge_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(ge_table)

    # ----- Footer on every page -----
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(AUOUR_GRAY)
        canvas.drawString(0.5 * inch, 0.4 * inch, FOOTER_TEXT)
        canvas.restoreState()

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    return buf.getvalue()
