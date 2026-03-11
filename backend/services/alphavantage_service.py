"""
AlphaVantage data analysis service for Equivalent Review.
Fetches TIME_SERIES_DAILY_ADJUSTED and computes returns, volatility, max drawdown, correlation.
"""
import logging
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

# AlphaVantage API - key from env ALPHAVANTAGE_API_KEY (Secret Manager: Alpha-API)
ALPHAVANTAGE_BASE = "https://www.alphavantage.co/query"


def _get_api_key() -> str:
    """Get AlphaVantage API key from environment (Alpha-API secret in Cloud Run)."""
    key = (os.getenv("ALPHAVANTAGE_API_KEY") or os.getenv("Alpha-API") or "").strip()
    if not key:
        raise ValueError("ALPHAVANTAGE_API_KEY (or Alpha-API) not configured")
    return key


def _fetch_daily_adjusted(ticker: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Fetch TIME_SERIES_DAILY_ADJUSTED for a ticker. Returns dict of date -> adjusted_close."""
    params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": ticker,
        "apikey": api_key,
        "outputsize": "full",  # Full history for 5Y+ calculations
    }
    try:
        resp = requests.get(ALPHAVANTAGE_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("AlphaVantage fetch failed for %s: %s", ticker, e)
        return None

    ts_key = "Time Series (Daily)"
    if ts_key not in data:
        err = data.get("Error Message") or data.get("Note") or str(data)[:200]
        logger.warning("AlphaVantage no time series for %s: %s", ticker, err)
        return None

    series = data[ts_key]
    result = {}
    for dt_str, vals in series.items():
        try:
            adj_close = vals.get("5. adjusted close")
            if adj_close:
                result[dt_str] = float(adj_close)
        except (TypeError, ValueError):
            continue
    return result if result else None


def _sorted_dates(series: Dict[str, float]) -> List[Tuple[date, float]]:
    """Return (date, price) sorted by date ascending."""
    out = []
    for dt_str, price in series.items():
        try:
            d = datetime.strptime(dt_str, "%Y-%m-%d").date()
            out.append((d, price))
        except ValueError:
            continue
    out.sort(key=lambda x: x[0])
    return out


def _annualized_return(prices: List[float], years: float) -> Optional[float]:
    """Compute annualized return from price series. years = 1, 3, or 5."""
    if not prices or len(prices) < 2 or years <= 0:
        return None
    start = prices[0]
    end = prices[-1]
    if start <= 0:
        return None
    total_return = (end / start) - 1.0
    # Annualized: (1 + total)^(1/years) - 1
    ann = (1.0 + total_return) ** (1.0 / years) - 1.0
    return ann


def _annualized_volatility(returns: List[float]) -> Optional[float]:
    """Annualized volatility (std of daily returns * sqrt(252))."""
    if not returns or len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    std = var ** 0.5
    return std * (252 ** 0.5)


def _max_drawdown(prices: List[float]) -> Optional[float]:
    """Max drawdown as decimal (e.g. -0.10 = -10%)."""
    if not prices or len(prices) < 2:
        return None
    peak = prices[0]
    mdd = 0.0
    for p in prices:
        if p > peak:
            peak = p
        dd = (p - peak) / peak if peak > 0 else 0.0
        if dd < mdd:
            mdd = dd
    return mdd


def _pearson_correlation(x: List[float], y: List[float]) -> Optional[float]:
    """Pearson correlation between two series (same length)."""
    if not x or not y or len(x) != len(y) or len(x) < 2:
        return None
    n = len(x)
    mx = sum(x) / n
    my = sum(y) / n
    sx = sum((xi - mx) ** 2 for xi in x) ** 0.5
    sy = sum((yi - my) ** 2 for yi in y) ** 0.5
    if sx == 0 or sy == 0:
        return None
    cov = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    return cov / (sx * sy)


def _daily_returns(prices: List[float]) -> List[float]:
    """Daily log returns (or simple returns if zero)."""
    out = []
    for i in range(1, len(prices)):
        if prices[i - 1] and prices[i - 1] > 0:
            r = (prices[i] / prices[i - 1]) - 1.0
            out.append(r)
    return out


def compute_metrics(
    legacy_ticker: str,
    model_ticker: str,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch AlphaVantage data for both tickers and compute:
    - Annualized returns (1Y, 3Y, 5Y)
    - Annualized volatility
    - Max drawdown
    - 1-year Pearson correlation between the two price series

    Returns dict with keys: leg_ret_1y, leg_ret_3y, leg_ret_5y, leg_vol, leg_mdd,
    mod_ret_1y, mod_ret_3y, mod_ret_5y, mod_vol, mod_mdd, correlation_1y.
    Missing values are None (e.g. N/A when insufficient history).
    """
    key = api_key or _get_api_key()
    today = date.today()

    leg_series = _fetch_daily_adjusted(legacy_ticker, key)
    mod_series = _fetch_daily_adjusted(model_ticker, key)
    if not leg_series or not mod_series:
        return {}

    leg_sorted = _sorted_dates(leg_series)
    mod_sorted = _sorted_dates(mod_series)
    if not leg_sorted or not mod_sorted:
        return {}

    out = {}

    def _slice_by_years(sorted_prices: List[Tuple[date, float]], years: int) -> List[float]:
        cutoff = today - timedelta(days=int(years * 365.25) + 30)
        sliced = [(d, p) for d, p in sorted_prices if d >= cutoff]
        return [p for _, p in sliced] if sliced else []

    for years, key_suffix in [(1, "1y"), (3, "3y"), (5, "5y")]:
        leg_p = _slice_by_years(leg_sorted, years)
        mod_p = _slice_by_years(mod_sorted, years)
        out[f"leg_ret_{key_suffix}"] = _annualized_return(leg_p, years) if leg_p else None
        out[f"mod_ret_{key_suffix}"] = _annualized_return(mod_p, years) if mod_p else None

    # Volatility and MDD from 1Y of data (or longest available)
    leg_1y = _slice_by_years(leg_sorted, 1)
    mod_1y = _slice_by_years(mod_sorted, 1)
    leg_returns = _daily_returns(leg_1y) if leg_1y else []
    mod_returns = _daily_returns(mod_1y) if mod_1y else []
    out["leg_vol"] = _annualized_volatility(leg_returns)
    out["mod_vol"] = _annualized_volatility(mod_returns)
    out["leg_mdd"] = _max_drawdown(leg_1y)
    out["mod_mdd"] = _max_drawdown(mod_1y)

    # Correlation: align dates, use 1Y of overlapping data
    leg_by_date = {d: p for d, p in leg_sorted}
    mod_by_date = {d: p for d, p in mod_sorted}
    common_dates = sorted(set(leg_by_date.keys()) & set(mod_by_date.keys()))
    cutoff_1y = today - timedelta(days=365 + 30)
    common_1y = [d for d in common_dates if d >= cutoff_1y]
    if len(common_1y) >= 20:
        leg_prices = [leg_by_date[d] for d in common_1y]
        mod_prices = [mod_by_date[d] for d in common_1y]
        leg_ret = _daily_returns(leg_prices)
        mod_ret = _daily_returns(mod_prices)
        min_len = min(len(leg_ret), len(mod_ret))
        if min_len >= 10:
            out["correlation_1y"] = _pearson_correlation(leg_ret[:min_len], mod_ret[:min_len])
        else:
            out["correlation_1y"] = None
    else:
        out["correlation_1y"] = None

    return out
