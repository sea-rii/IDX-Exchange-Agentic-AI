# IDX Exchange Agentic AI

My work for the IDX Exchange AI Agentic Engineer Internship. The project is a real estate
assistant built on OpenClaw. You send it a message (WhatsApp or the OpenClaw dashboard), and a
skill answers it using the MLS data in MySQL: property search, market stats, style search,
recommendations and a document assistant.

Each week is one skill in its own folder. Every skill has a `SKILL.md` that tells OpenClaw when
and how to run it, a `scripts/` folder, and tests that run without MySQL or OpenAI.

## Folder structure

```
IDX-Exchange-Agentic-AI/
├── architecture.md         # Week 1 architecture diagrams
├── nl-property-search/     # Week 2: message -> search filters
├── mls-search/             # Week 3: filters -> MySQL -> property cards
├── conversational-search/  # Week 4: multi-turn search
├── market-stats/           # Week 5: market statistics
├── semantic-search/        # Week 6: embeddings and style search
├── recommendations/        # Week 7: "homes like this one"
├── rag-assistant/          # Week 8: answers from documents (RAG)
├── data/
│   ├── *.sql               # MLS data (not committed)
│   ├── embeddings/         # Week 6 index (not committed)
│   ├── rag-sources/        # Week 8 source documents
│   └── rag-index/          # Week 8 index (not committed)
├── package.json
├── tsconfig.json
└── .env                    # credentials (not committed)
```

## Setup

1. Install Node 22 or newer and MySQL (`brew install mysql`).
2. Import the MLS data into a database named `idx_exchange`:
   ```bash
   mysql -u root idx_exchange < data/california_sold.sql
   mysql -u root idx_exchange < data/rets_property.sql
   ```
   My import has 55,212 active listings (`rets_property`) and 98,552 sold homes (`california_sold`).
3. Create a `.env` file in the root folder:
   ```
   MYSQL_HOST=localhost
   MYSQL_USER=idx_user
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=idx_exchange
   OPENAI_API_KEY=your_key
   ```
4. Install packages: `npm install`
5. To use a skill in OpenClaw: `openclaw skills install ./<skill-folder>`, add it to `"skills"`
   in `~/.openclaw/openclaw.json`, then start the gateway and open the dashboard.

---

## Week 0: Setup

Installed OpenClaw from source, set up MySQL, imported the MLS data, created the `.env` and
`.gitignore`, and connected OpenClaw to WhatsApp. I locked WhatsApp down to my own number
(`dmPolicy: "allowlist"`) after OpenClaw started replying to my contacts.

## Week 1: Architecture

`architecture.md` has two Mermaid diagrams: how a message flows from WhatsApp through the
OpenClaw gateway and agent to the skills and MySQL, and a step-by-step walkthrough of one query.

## Week 2: Natural Language Property Search

`nl-property-search/` turns a message like "3-bedroom condos in Irvine under $1.5M with a pool"
into filters (city, price, beds, baths, sqft, home type, pool, view, HOA), each mapped to its
`rets_property` column.

```bash
node --test nl-property-search/tests/parser.test.ts      # 16 tests
node nl-property-search/scripts/parse.ts "Show me 3-bedroom condos in Irvine under \$1.5M with a pool"
```

## Week 3: MLS Database Integration

`mls-search/` runs the Week 2 filters against MySQL and returns property cards: active listings
from `rets_property` (5 per page, sorted by price) and recent sales from `california_sold`.
Its `db.ts` and card format are reused by every later week.

```bash
node --test mls-search/tests/mls.test.ts                 # 12 tests
node mls-search/scripts/search.ts "Show me 3 bedroom condos in Irvine under \$1.5M"
node mls-search/scripts/search.ts --sold "What have homes in Pasadena sold for?"
```

## Week 4: Conversational Property Search

`conversational-search/` makes the search a conversation. It asks for city, budget and home type
(skipping anything already given), remembers filters between messages, and searches again when
the user adds or changes something ("with a pool", "what about Tustin?", "more", "start over").

```bash
node --test conversational-search/tests/conversation.test.ts   # 19 tests
```

## Week 5: Market Statistics

`market-stats/` answers questions like "Is now a good time to buy in San Diego?" with median and
average price, $/sqft, days on market, list-to-close ratio, months of supply, a monthly trend,
and a market read (leans seller's, buyer's or mixed) with the reasons.

- Time windows count back from the newest sale, not today, because the data is a fixed export.
- The data only covers about 5 full months, so the report detects which months are covered.
- Close dates in the future (typos like 2072) are skipped.

```bash
node --test market-stats/tests/market.test.ts            # 12 tests
node market-stats/scripts/market.ts "Is now a good time to buy in San Diego?"
node market-stats/scripts/market.ts --by type "How is the market in Pasadena?"
node market-stats/scripts/market.ts --top
```

## Week 6: Embeddings and Semantic Search

`semantic-search/` finds listings by style or feel ("charming craftsman with mountain views")
using OpenAI `text-embedding-3-small` embeddings of each listing's details and description.

- All 55,212 listings are embedded once and saved (about $0.32), not on every search.
- 512 dimensions instead of 1536, so the index is 3x smaller and faster.
- Hard filters from the Week 2 parser (city, price, beds...) are applied before ranking.

```bash
node --test semantic-search/tests/semantic.test.ts       # 16 tests
node semantic-search/scripts/build-index.ts --dry-run    # cost estimate
node semantic-search/scripts/build-index.ts
node semantic-search/scripts/similar.ts "charming craftsman with mountain views and character"
```

## Week 7: Recommendation Engine

`recommendations/` takes a listing the user likes (MLS number or address) and returns the 5 most
similar active listings of the same home type. Each gets a score out of 100 (price 20, beds 15,
city 15, size 10, style 40 from the Week 6 embeddings) and a price check against recent comps
in `california_sold` (median $/sqft of similar-size sales in the same city).

```bash
node --test recommendations/tests/recommend.test.ts      # 12 tests
node recommendations/scripts/recommend.ts "MLS# 1142070303"
node recommendations/scripts/recommend.ts "177 Frame, Irvine"
```

## Week 8: Retrieval-Augmented Generation (RAG)

`rag-assistant/` answers questions about real estate terms and MLS fields from source documents
instead of the model's memory, and lists its sources.

Documents in `data/rag-sources/`:

| File | Covers |
|---|---|
| `trestle-fields.md` | RESO-standard field definitions (DOM, ClosePrice...), from the public RESO Data Dictionary 2.0 that Trestle uses |
| `idx-schema-reference.md` | Handbook pages 4–5: what each column means, including IDX's own names (`L_SystemPrice`, `L_Keyword2`...) and how to join the tables |
| `table-schema.md` | Every column in both tables, generated from MySQL |
| `market-summaries.md` | Week 5 reports for the 15 busiest cities, generated |

How it works: documents are split by heading into chunks, each chunk is embedded once, a question
retrieves the 4 closest chunks, and `gpt-4o-mini` answers using only those chunks with citations.
If nothing relevant is found, it says so instead of guessing.

Still to add: the Real Estate Data Analyst Primer, for glossary terms like list-to-close ratio.

```bash
node --test rag-assistant/tests/rag.test.ts              # 14 tests
node rag-assistant/scripts/make-schema-doc.ts            # writes table-schema.md
node rag-assistant/scripts/make-market-docs.ts           # writes market-summaries.md
node rag-assistant/scripts/build-index.ts                # less than a cent
node rag-assistant/scripts/ask.ts "What does DOM mean?"
node rag-assistant/scripts/ask.ts "What columns are in california_sold?"
```