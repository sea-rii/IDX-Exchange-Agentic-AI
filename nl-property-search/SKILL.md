---
name: nl-property-search
description: Turn a free-text real estate search ("3-bedroom condos in Irvine under $1.5M with a pool") into a structured filter object for the rets_property table. Use whenever the user asks to find, search, or list properties or homes for sale.
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

Run the user's message, exactly as written, as one quoted argument:

```bash
node {baseDir}/scripts/parse.ts "<the user's query>"
```
