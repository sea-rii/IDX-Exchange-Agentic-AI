---
name: recommendations
description: Given an active listing the user likes (by MLS number or address), finds the 5 most similar active listings in rets_property with a hybrid score (price, beds, city, size plus description embeddings), and checks each price against recent sales in california_sold.
---

# Listing Recommendations

Use this skill when the user points at one specific listing and wants more like it, for example
"show me homes like MLS# OC26123456", "anything similar to 24 Willow Bend, Irvine?" or
"I love this one, what else is like it?" after a listing card was shown.
Do not use it for a free-text description of a style with no specific listing (that is
semantic-search), or for market statistics.

## How to run it

Run the script once per request, from the project folder:

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node recommendations/scripts/recommend.ts '<MLS number or address>'
```

- Pass only the MLS number (like `MLS# OC26123456`) or the street address with the city
  (like `24 Willow Bend, Irvine`), not the user's whole message.
- If the user means a listing from an earlier reply, use the `MLS#` from that listing card.
- Keep the double quotes around the folder path. The folder name `projects ` ends with a space.
- Put the MLS number or address in single quotes. If it contains a single quote, write it as `'\''`.
- If the user asks for more results, add `--top 10` before it.
- If the user wants other home types too (for example condos as well as houses), add `--any-type`.

## How to reply

- Send the script's output back to the user exactly as it is. Do not rewrite, shorten or add to it.
- Do not add your own descriptions, advice, price opinions or links. Everything in the reply must
  come from the script output.
- If the script lists several matching listings and asks which one, show that list and ask the
  user to pick. Then run the script again with the chosen MLS number.
- If the script says it couldn't find the listing, ask the user for the MLS number.
- If the script says the index hasn't been built, the listing isn't in the index, or prints an
  error, tell the user recommendations are not available for that listing right now.
