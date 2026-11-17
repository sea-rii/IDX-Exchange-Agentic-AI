---
name: rag-assistant
description: Answers questions about real estate terms (DOM, escrow, comps, cap rate, list-to-close ratio), MLS field and column definitions (rets_property, california_sold, Trestle/RESO fields), and the saved market summaries, using indexed source documents. Use for "what does X mean", "what is a Y", or "what columns/fields are in Z" questions. Not for searching listings or computing new market stats.
---

# Real estate document assistant (RAG)

Answers definition and reference questions from the indexed documents: the Real Estate Data
Analyst Primer, the Trestle field definitions, the MLS table schema and the Week 5 market
summaries. Every answer comes with its sources.

## When to use

- "What does DOM mean?", "What is a list-to-close ratio?", "What is escrow?"
- "What columns are in california_sold?", "What is L_SystemPrice?", "What does StandardStatus mean?"
- "What did the market summary say about Irvine?"

Do not use it to search for homes or to calculate fresh market numbers. Other skills do that.

## How to run

```bash
cd "/Users/saisirichittineni/projects /IDX-Exchange-Agentic-AI" && node rag-assistant/scripts/ask.ts '<the user question>'
```

- Keep the double quotes around the folder path. The folder name `projects ` ends with a space.
- Pass the user's question as it is. Put it in single quotes. If it contains a single quote,
  write it as `'\''`.
- If the user asks a follow-up like "and what about CDOM?", write it as a full question first
  ("What does CDOM mean?").

## How to reply

- Send the script's output back to the user exactly as it is, including the `Sources:` list.
  Do not rewrite, shorten or add to it.
- Do not add facts, definitions or examples of your own. Everything in the reply must come from
  the script output.
- If the script says it couldn't find the answer in the indexed documents, tell the user that,
  and do not answer from your own knowledge.
- If the script says the index hasn't been built or prints an error, tell the user the document
  assistant is not available right now.
