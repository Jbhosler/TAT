"""
Asset classifier utility to identify individual stocks vs funds.
"""
from typing import List
from backend.logic.rebalancer import Holding


# Common ETF/Mutual Fund suffixes and patterns
FUND_SUFFIXES = ['SPY', 'VTI', 'VOO', 'QQQ', 'VEA', 'VWO', 'AGG', 'BND', 'TLT']
KNOWN_FUND_TICKERS = {
    # Common ETFs
    'SPY', 'SPYM', 'VTI', 'VOO', 'QQQ', 'VEA', 'VWO', 'AGG', 'BND', 'TLT',
    'IVV', 'IWM', 'EFA', 'EEM', 'IEFA', 'IEMG', 'VGK', 'VPL', 'VXUS',
    # Vanguard funds
    'VTSAX', 'VTIAX', 'VBTLX', 'VIGAX', 'VIMAX', 'VSMAX',
    # iShares funds
    'ITOT', 'IXUS', 'IGSB', 'IGV', 'IJH', 'IJR',
    # Other common funds
    'SCHX', 'SCHF', 'SCHZ', 'SWTSX', 'SWISX'
}


def is_likely_fund(ticker: str) -> bool:
    """
    Heuristic to determine if a ticker is likely a fund vs individual stock.
    
    Args:
        ticker: Ticker symbol to check
        
    Returns:
        True if likely a fund, False if likely an individual stock
    """
    ticker_upper = ticker.upper()
    
    # Check against known fund list
    if ticker_upper in KNOWN_FUND_TICKERS:
        return True
    
    # Check for common fund suffixes/patterns
    # Many funds end with X (mutual funds) or have specific patterns
    if ticker_upper.endswith('X') and len(ticker_upper) >= 4:
        return True
    
    # Check if it matches any fund suffix pattern
    for suffix in FUND_SUFFIXES:
        if suffix in ticker_upper:
            return True
    
    # Individual stocks are typically 1-5 characters, no X suffix
    # This is a simple heuristic - can be improved with actual data
    if len(ticker_upper) <= 5 and not ticker_upper.endswith('X'):
        # Could be either, but default to individual stock if not in known list
        return False
    
    # Default: assume it's a fund if we're not sure
    return True


def classify_holdings_as_side_pocket(holdings: List[Holding]) -> List[Holding]:
    """
    Classify holdings and mark individual stocks as side-pocket.
    
    Args:
        holdings: List of holdings to classify
        
    Returns:
        List of holdings with is_side_pocket flag set
    """
    classified = []
    for holding in holdings:
        # If not already classified, use heuristic
        if not hasattr(holding, 'is_side_pocket') or holding.is_side_pocket is None:
            holding.is_side_pocket = not is_likely_fund(holding.ticker)
        classified.append(holding)
    
    return classified
