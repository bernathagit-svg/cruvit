# CRUVIT Intelligent Store — First Real Product Path (V1)

This document defines the future path when one product receives a real Commercial Lead.
It is **not** an authorization to execute the path now.

## Future path

1. **Commercial Lead** — product survives commerce intelligence gates (economics, competitiveness, activation eligibility as applicable).
2. **Commercial Validation** — Owner review confirms commercial readiness boundaries.
3. **Physical Test Order** — physical commerce validation under `PHYSICAL_COMMERCE = VALIDATION_ONLY` rules then in force.
4. **Owner approval** — explicit approval to sell.
5. **Real product data package** — title, images, price, specs, shipping/returns facts that are known (UNKNOWN otherwise).
6. **Shopify product creation** — write real product into Shopify (not executed in Storefront Readiness V1).
7. **Store placement** — add product to `store/catalog.json` `sellableProducts` and category membership; remove DEMO_PREVIEW_ONLY placeholders from customer paths.
8. **Recommendation linkage** — optional “Why this may fit your garden” only when backed by real CRUVIT context.
9. **Production verification** — Store home, PDP, cart, checkout path smoke on production.

## Files / data that would change later

| Area | Likely files |
|------|----------------|
| Catalog truth | `store/catalog.json` |
| Store home empty state | `store/index.html` (hide curation-empty once products exist) |
| PDP | new `store/product/<handle>/index.html` or Shopify-hosted PDP + optional Netlify bridge |
| Cart / checkout | `store/cart/index.html` + Shopify Checkout enablement (replace disabled checkout) |
| Policies | `store/policies/**` once Owner supplies final text |
| App Shopping tab | optional later link from `app.html` Shopping empty-state → `/store/` (not required for V1) |
| Homepage marketing `#store` | optional later CTA to `/store/` — **out of scope for this readiness checkpoint** |

## Explicitly not done in Storefront Readiness V1

- No supplier discovery
- No Shopify product writes
- No orders / payments
- No fake sellable catalog
- No WTP / Meta experiment changes
