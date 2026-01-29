"""
CSV parsing utilities for Strategy, Prospect, and Product Equivalents uploads.
"""
import csv
import io
from typing import List, Dict, Any
from decimal import Decimal
from backend.api.models.schemas import (
    BulkStrategyUpload,
    ProspectCSVRow,
    ProductEquivalentCSVRow
)
from backend.api.models.database import AssetClass


def parse_strategy_bulk_upload(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Strategy bulk upload CSV.
    Format: Strategy Name, Model Ticker, Asset Class, Target %, Drift %
    
    Args:
        csv_content: CSV file content as string
        
    Returns:
        List of strategy position dictionaries grouped by strategy name
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    
    strategies = {}
    
    for row in reader:
        strategy_name = row['Strategy Name'].strip()
        model_ticker = row['Model Ticker'].strip()
        asset_class_str = row['Asset Class'].strip()
        target_allocation = Decimal(row['Target %'].strip())
        drift_percentage = Decimal(row['Drift %'].strip())
        
        # Validate asset class
        try:
            asset_class = AssetClass(asset_class_str)
        except ValueError:
            raise ValueError(f"Invalid asset class: {asset_class_str}")
        
        # Validate precision (0.1%)
        target_allocation = round(target_allocation, 3)
        drift_percentage = round(drift_percentage, 3)
        
        if strategy_name not in strategies:
            strategies[strategy_name] = {
                'name': strategy_name,
                'positions': []
            }
        
        strategies[strategy_name]['positions'].append({
            'model_ticker': model_ticker,
            'asset_class': asset_class,
            'target_allocation': target_allocation,
            'drift_percentage': drift_percentage
        })
    
    return list(strategies.values())


def parse_prospect_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse Prospect CSV.
    Format: Ticker, Value ($), Unrealized Gain/Loss ($)
    
    Args:
        csv_content: CSV file content as string
        
    Returns:
        List of prospect holding dictionaries
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    
    holdings = []
    
    for row in reader:
        ticker = row['Ticker'].strip()
        # Handle different possible column names
        value_str = row.get('Value ($)', row.get('Value', '0')).strip().replace('$', '').replace(',', '')
        gain_loss_str = row.get('Unrealized Gain/Loss ($)', row.get('Unrealized Gain/Loss', '0')).strip().replace('$', '').replace(',', '')
        
        value = Decimal(value_str)
        unrealized_gain_loss = Decimal(gain_loss_str)
        
        holdings.append({
            'ticker': ticker,
            'value': value,
            'unrealized_gain_loss': unrealized_gain_loss
        })
    
    return holdings


def parse_product_equivalents_csv(csv_content: str) -> List[Dict[str, Any]]:
    """
    Parse GE_Alt.csv (Product Equivalents).
    Format: Legacy Ticker, Model Ticker, Grade
    
    Args:
        csv_content: CSV file content as string
        
    Returns:
        List of product equivalent dictionaries
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    
    equivalents = []
    
    for row in reader:
        legacy_ticker = row['Legacy Ticker'].strip()
        model_ticker = row['Model Ticker'].strip()
        grade = int(row['Grade'].strip())
        
        # Validate grade
        if grade not in [0, 1, 2]:
            raise ValueError(f"Invalid grade: {grade}. Must be 0, 1, or 2.")
        
        equivalents.append({
            'legacy_ticker': legacy_ticker,
            'model_ticker': model_ticker,
            'grade': grade
        })
    
    return equivalents
