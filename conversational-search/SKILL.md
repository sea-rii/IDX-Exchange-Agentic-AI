---
name: conversational-search
description: Multi-turn home search. Asks follow-up questions (city, budget, home type), remembers the user's filters between messages, and refines active MLS listings (rets_property) as the user adds or changes details.
---

# Conversational Property Search

Use this skill for every message in a conversation about finding homes for sale, including short
follow-up replies like "Irvine", "under 1.2M", "single family", "with a pool", "more" or "start over".

## How to run it

Run the script once per user message, from the project folder (that is where the MySQL driver and
the database login are). Pass the user's message exactly as they wrote it, and pass the sender's id
so each person keeps their own search:

```bash
cd "/Users/saisirichittineni/Downloads/projects /IDX-Exchange-Agentic-AI" && node conversational-search/scripts/chat.ts --user '<sender id>' '<user message>'
```

- Keep the double quotes around the folder path. The folder name `projects ` ends with a space.
- Put the user's message in single quotes, never double quotes. In double quotes the shell turns
  `$1.2M` into `.2M`, so the budget becomes $200K.
- If the message itself contains a single quote (like `don't`), write it as `'\''`.
  Example: `'I don'\''t need a pool'`.
- Run this exact command. Do not run the copy of the script in the skills folder.
- On WhatsApp, the sender id is the sender's phone number.
- In the dashboard chat, use `dashboard` as the sender id.
- Always use the same sender id for the same person.

If the user says "start over" or "new search", pass that message to the script as well. The script
clears the old filters itself.

## How to reply

- Send the script's output back to the user exactly as it is. Do not rewrite, shorten or add to it.
- Do not ask your own follow-up questions. The script decides what to ask next.
- Do not add notes, verification claims, price checks, market comments or links. Everything in the
  reply must come from the script output.
- Do not run the `mls-search` or `nl-property-search` scripts separately during this conversation.
  This script already uses them.
- If the script prints an error, tell the user the search is not available right now.
