# Rebalancer Test Plan

This document describes the trading logic checks and the tests that verify pre/post portfolio totals and cash flow.

## Logic Fixes Applied

1. **Cash = proceeds minus buys**  
   Cash residual is now `total_sold - total_bought` (proceeds from sells minus what we spent on buys), not `remaining_value - total_bought`. That keeps cash consistent with actual proceeds.

2. **Targets on full portfolio**  
   `calculate_buys` now takes both `remaining_value` (value of kept positions) and `total_value` (full portfolio). Target dollar amounts use `total_value`; current dollar amounts use `remaining_value`. Buys are computed to reach target % of the full portfolio.

3. **Cap buys to proceeds**  
   If `total_bought > total_sold`, buy orders are scaled down so we never spend more than proceeds. Then `cash_residual = total_sold - total_bought` (non‑negative).

4. **Normalize post total to pre total**  
   After building `post_holdings`, cash is set to `pre_total - post_sum_without_cash` so `sum(post_holdings) == sum(pre_holdings)` (avoids rounding drift).

## Tests in `test_rebalancer.py`

| Test | Purpose |
|------|--------|
| **test_rebalance_pre_total_equals_post_total_no_trades** | One asset class at target; no sells/buys. Asserts `sum(pre_holdings) == sum(post_holdings)`. |
| **test_rebalance_pre_total_equals_post_total_with_side_pocket** | Prospect has side‑pocket holdings. Asserts pre total equals post total. |
| **test_rebalance_pre_total_equals_post_total_with_sells_and_buys** | Two asset classes; rebalance triggers sells and buys. Asserts pre total equals post total. |
| **test_rebalance_cash_does_not_exceed_proceeds** | Asserts `total_bought <= total_sold` (within 1 unit rounding) and `cash_residual >= 0`. |
| **test_rebalance_post_holdings_sum_equals_pre_total** | 60/40 target with drift; asserts `sum(pre_holdings) == sum(post_holdings)`. |
| **test_calculate_buys_uses_full_portfolio_for_targets** | Unit test: `calculate_buys` uses `total_value` for target dollar amounts (e.g. 50% of 100k = 50k, not 50% of 80k). |

## Running the Tests

From project root (with pytest installed):

```bash
python -m pytest tests/test_rebalancer.py -v --tb=short
```

Or run a single test:

```bash
python -m pytest tests/test_rebalancer.py::test_rebalance_pre_total_equals_post_total_no_trades -v
```

## Additional Test Ideas (Manual or Future)

1. **Forced sale** – Prospect with forced‑sale holdings; confirm pre total includes them and post total equals pre total.
2. **Unmapped holdings** – Prospect with unmapped holdings; confirm they appear in pre_holdings and pre total equals post total.
3. **Round‑trip** – Run rebalance twice (second run on “post” as if it were a new prospect); totals should stay consistent.
4. **Edge: zero sells** – Portfolio already at or below target; no sell orders; post = remaining + buys + cash, sum = pre total.
5. **Edge: zero buys** – All classes overweight or at target; no buy orders; cash = total_sold; post total = pre total.
6. **Numerical stability** – Large portfolio (e.g. 10M); assert pre total equals post total within a small tolerance (e.g. 0.01).

## Invariants to Keep

- `sum(pre_holdings) == sum(post_holdings)` (normalization step enforces this).
- `total_bought <= total_sold` (after scaling when needed).
- `cash_residual >= 0`.
- Pre total = `total_value` (sum of all prospect holdings: mapped + forced sale + side pocket + unmapped).
