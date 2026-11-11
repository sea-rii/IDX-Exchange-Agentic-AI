---
name: semantic-search
description: Finds the 5 active listings most similar to a free-text description of a home's style or feel (for example "charming craftsman with mountain views and character"), using OpenAI embeddings and cosine similarity on rets_property.
---

# Semantic Property Search

Use this skill when the user describes the style, feel or character of a home they want, for
example "charming craftsman with mountain views", "bright modern home with an open floor plan"
or "quiet cottage with a big garden near the beach". It can also include a city, price or
number of beds. Do not use it for market statistics.

## How to run it

Run the script once per request, from the project folder (that is where the MySQL driver, the
database login and the saved embeddings are):

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node semantic-search/scripts/similar.ts '<user message>'
```

- Keep the double quotes around the folder path. The folder name `projects ` ends with a space.
- Put the user's message in single quotes, never double quotes, so a price like `$1.5M` stays as is.
- If the message itself contains a single quote (like `I'd`), write it as `'\''`.
  Example: `'I'\''d love a craftsman with mountain views'`.
- If the user asks for more results, add `--top 10` before the message.
- Never run `build-index.ts`. Only the developer runs it.

## How to reply

- Send the script's output back to the user exactly as it is. Do not rewrite, shorten or add to it.
- Do not add your own descriptions, advice, price checks or links. Everything in the reply must
  come from the script output.
- If the script says no listings match, tell the user that and suggest a wider price range or
  another city.
- If the script says the index hasn't been built, or prints an error, tell the user semantic
  search is not available right now.
