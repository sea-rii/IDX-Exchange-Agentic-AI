---
name: market-stats
description: Answers California housing market questions (is now a good time to buy, price per sq ft, median price, days on market, list-to-close ratio, 12-month trend) for a city or ZIP, using past sales in california_sold.
---

# Market Statistics

Use this skill when the user asks how the housing market is doing in a city or ZIP code, for
example "Is now a good time to buy in San Diego?", "What is the average price per sq ft in
Pasadena?", "How fast are homes selling in Irvine?" or "Which cities have the most sales?".
Do not use it to find homes for sale.

## How to run it

Run the script once per question, from the project folder (that is where the MySQL driver and
the database login are):

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node market-stats/scripts/market.ts '<user question>'
```

- Keep the double quotes around the folder path. The folder name `projects ` ends with a space.
- Put the user's question in single quotes, never double quotes.
- If the question itself contains a single quote (like `what's`), write it as `'\''`.
  Example: `'What'\''s the market like in Irvine?'`.
- If the user asks to compare home types (condos vs houses), add `--by type` before the question.
- If the user asks to compare ZIP codes in a city, add `--by zip` before the question.
- If the user asks which cities have the most sales, run it with only `--top`.

## How to reply

- Send the script's output back to the user exactly as it is. Do not rewrite, shorten or add to it.
- Do not add your own advice, predictions, price checks, market comments or links. Everything in
  the reply must come from the script output.
- If the script asks which city, ask the user that, then run it again with their answer.
- If the script prints an error, tell the user market stats are not available right now.
