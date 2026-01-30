"""
Generate adviser-ready PDF transition report (landscape, Auour branding).
Uses ReportLab for layout, tables, and pagination.
All dimensions in points (1 inch = 72 pt).
"""
from io import BytesIO
from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import date

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

# Landscape letter: width=792pt, height=612pt. Margins 0.5" each side => content width = 792 - 72 = 720 pt
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


def build_transition_report_pdf(
    prospect_name: str,
    strategy_name: str,
    report_date: Optional[date] = None,
    total_value: float = 0.0,
    total_gains: float = 0.0,
    total_losses: float = 0.0,
    net_gain_loss: float = 0.0,
    model_purity_pct: float = 0.0,
    cash_residual: float = 0.0,
    pre_holdings: Optional[List[Dict[str, Any]]] = None,
    post_holdings: Optional[List[Dict[str, Any]]] = None,
    sell_orders: Optional[List[Dict[str, Any]]] = None,
    buy_orders: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """
    Build a landscape PDF report. All numeric values can be float or Decimal.
    pre_holdings/post_holdings: list of dicts with ticker/model_ticker, asset_class, value, optional ticker (legacy).
    sell_orders: list of dicts with ticker, value, gain_loss, grade.
    buy_orders: list of dicts with model_ticker, value, asset_class.
    """
    report_date = report_date or date.today()
    pre_holdings = pre_holdings or []
    post_holdings = post_holdings or []
    sell_orders = sell_orders or []
    buy_orders = buy_orders or []

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(letter),
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.9 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=AUOUR_NAVY,
        spaceAfter=4,
        alignment=TA_CENTER,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=AUOUR_NAVY,
        spaceAfter=6,
        spaceBefore=10,
    )
    normal_style = styles["Normal"]

    story = []

    # ----- Header -----
    story.append(Paragraph("Auour Investments Transition Report", title_style))
    story.append(Paragraph(f"<b>Prospect:</b> {_str(prospect_name)}", normal_style))
    story.append(Paragraph(f"<b>Strategy:</b> {_str(strategy_name)}", normal_style))
    story.append(Paragraph(f"<b>Report Date:</b> {report_date.strftime('%B %d, %Y')}", normal_style))
    story.append(Spacer(1, 12))

    # ----- Section 1: Portfolio Impact Summary -----
    story.append(Paragraph("1. Portfolio Impact Summary", heading_style))

    total_gains_fmt = f"${total_gains:,.0f}" if total_gains else "$0"
    total_losses_fmt = f"${total_losses:,.0f}" if total_losses else "$0"
    net_fmt = f"${net_gain_loss:,.0f}" if net_gain_loss else "$0"
    purity_fmt = f"{model_purity_pct:.1f}%"

    summary_data = [
        ["Tax Realization", "", ""],
        ["Total Gains", total_gains_fmt, ""],
        ["Total Losses", total_losses_fmt, ""],
        ["Net Capital Gain/Loss", net_fmt, ""],
        ["", "", ""],
        ["Model Purity Score", f"{purity_fmt} of final portfolio in Grade 0 (Model) tickers", ""],
    ]
    summary_table = Table(summary_data, colWidths=[2 * inch, 3 * inch, 2 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("SPAN", (1, 3), (2, 3)),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 16))

    # ----- Section 2: Side-by-Side Allocation (new page for clean layout) -----
    story.append(PageBreak())
    story.append(Paragraph("2. Current vs. Proposed Portfolio by Asset Class", heading_style))

    # Content width in points; each half gets half of that
    half_width_pt = CONTENT_WIDTH_PT / 2
    w_per_col_pt = half_width_pt / 6  # 6 columns per table

    total_pre = sum(_float(h.get("value")) for h in pre_holdings) or 1.0
    current_rows = [["Ticker", "Desc", "Grade", "Asset Class", "Value ($)", "Alloc %"]]
    for h in pre_holdings:
        ticker = _str(h.get("ticker"))
        val = _float(h.get("value"))
        pct = (val / total_pre * 100) if total_pre else 0
        current_rows.append([
            ticker[:12] if len(ticker) > 12 else ticker,
            ticker[:10] if len(ticker) > 10 else ticker,
            "—",
            _str(h.get("asset_class"))[:14],
            f"{val:,.0f}",
            f"{pct:.1f}%",
        ])
    if len(current_rows) == 1:
        current_rows.append(["—", "—", "—", "—", "—", "—"])

    total_post = sum(_float(h.get("value")) for h in post_holdings) or 1.0
    proposed_rows = [["Ticker", "Desc", "Grade", "Asset Class", "Value ($)", "Alloc %"]]
    for h in post_holdings:
        model_ticker = _str(h.get("model_ticker"))
        legacy = h.get("ticker")
        desc = _str(legacy)[:10] if legacy else "Model"
        grade_label = "Model" if not legacy else "Legacy"
        val = _float(h.get("value"))
        pct = (val / total_post * 100) if total_post else 0
        display_ticker = (model_ticker if not legacy else _str(legacy))[:12]
        proposed_rows.append([
            display_ticker,
            desc,
            grade_label,
            _str(h.get("asset_class"))[:14],
            f"{val:,.0f}",
            f"{pct:.1f}%",
        ])
    if len(proposed_rows) == 1:
        proposed_rows.append(["—", "—", "—", "—", "—", "—"])

    current_table = Table(current_rows, colWidths=[w_per_col_pt] * 6)
    current_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (4, -1), "LEFT"),
        ("ALIGN", (5, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    proposed_table = Table(proposed_rows, colWidths=[w_per_col_pt] * 6)
    proposed_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (4, -1), "LEFT"),
        ("ALIGN", (5, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))

    side_by_side = Table([[current_table, proposed_table]], colWidths=[half_width_pt, half_width_pt])
    side_by_side.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 8),
        ("LEFTPADDING", (1, 0), (1, -1), 8),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
    ]))
    story.append(side_by_side)
    story.append(Spacer(1, 20))

    # ----- Section 3: Trade Order Execution List (new page so it never overlaps) -----
    story.append(PageBreak())
    story.append(Paragraph("3. Trade Order Execution List", heading_style))

    def sell_reasoning(grade: int) -> str:
        if grade == 0:
            return "Liquidated Grade 0 (Model) asset"
        if grade == 1:
            return "Liquidated Grade 1 equivalent"
        return "Liquidated Grade 2 asset"

    trade_rows = [["Action", "Ticker", "Amount ($)", "Reasoning"]]
    for so in sell_orders:
        trade_rows.append([
            "SELL",
            _str(so.get("ticker"))[:20],
            f"{_float(so.get('value')):,.0f}",
            sell_reasoning(int(so.get("grade", 2))),
        ])
    for bo in buy_orders:
        trade_rows.append([
            "BUY",
            _str(bo.get("model_ticker"))[:20],
            f"{_float(bo.get('value')):,.0f}",
            f"Rebalance to {_str(bo.get('asset_class'))}"[:35],
        ])
    if len(trade_rows) == 1:
        trade_rows.append(["—", "—", "—", "No trades"])

    trade_col_width_pt = CONTENT_WIDTH_PT / 4
    trade_table = Table(trade_rows, colWidths=[trade_col_width_pt] * 4)
    trade_styles = [
        ("BACKGROUND", (0, 0), (-1, 0), AUOUR_NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(trade_rows)):
        if trade_rows[i][0] == "SELL":
            trade_styles.append(("TEXTCOLOR", (0, i), (0, i), AUOUR_RED))
        elif trade_rows[i][0] == "BUY":
            trade_styles.append(("TEXTCOLOR", (0, i), (0, i), AUOUR_GREEN))
    trade_table.setStyle(TableStyle(trade_styles))
    story.append(trade_table)

    # ----- Footer on every page -----
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(AUOUR_GRAY)
        canvas.drawString(0.5 * inch, 0.4 * inch, FOOTER_TEXT)
        canvas.restoreState()

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    return buf.getvalue()
