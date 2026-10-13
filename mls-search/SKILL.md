---
name: mls-search
description: Search active MLS listings (rets_property) or recent sold comps (california_sold) from a free-text request, and reply with property cards.
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# MLS Search

Use this when the user wants to see homes for sale, or recent sales ("comps") in a city.
Always run the script from the repo folder, exactly as shown.

## Active listings

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node mls-search/scripts/search.ts "<the user's request, word for word>"
```

For the next page, add `--page 2` (then 3, and so on) before the request.

## Sold comps

When the user asks about sold homes, recent sales, comps, or what homes sold for:

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node mls-search/scripts/search.ts --sold "<the user's request, word for word>"
```

If it says there were no sales, rerun with `--months 24`.

## How to reply

- Send the script output exactly as it is. Do not change prices, dates, or any other numbers.
- Do not add notes, checks, or comments about the listings. Do not say you checked
  Redfin, Zillow, or any other website. You did not, and this skill does not do that.
- After the cards, add one line: "These come from the MLS data feed and may not be current."
- If it says no listings match, suggest loosening one filter (price, beds, or city).
- If it asks which city, ask the user.