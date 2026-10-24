# IDX Exchange Agentic AI

My work for the IDX Exchange AI Agentic Engineer Intern. The project is a real estate
assistant built on OpenClaw. You send it a message (WhatsApp or the OpenClaw dashboard), it
turns the message into search filters, queries the MLS data in MySQL, and replies with
property cards.

## Folder structure

```
IDX-Exchange-Agentic-AI/
├── data/                   # MLS .sql files (not committed)
├── nl-property-search/     # Week 2 skill
├── mls-search/             # Week 3 skill
├── conversational-search/  # Week 4 skill
├── architecture.md         # Week 1 architecture diagrams
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
4. Install packages:
   ```bash
   npm install
   ```

---

## Week 1: Architecture

`architecture.md` shows how the parts of the system connect, with Mermaid diagrams:

- A flow diagram from WhatsApp, through the OpenClaw gateway and agent, to the skills,
  tools and the MySQL data.
- A sequence diagram that walks through one example query from message to reply.

---

## Week 2: Natural Language Property Search

Skill folder: `nl-property-search/`

This skill turns a free-text request into a filter object. For example,
"Show me 3-bedroom condos in Irvine under $1.5M with a pool" becomes:

```json
{
  "city": "Irvine",
  "maxPrice": 1500000,
  "beds": 3,
  "type": "Condominium",
  "pool": "True"
}
```

It also lists each filter with its `rets_property` column, so Week 3 can query it directly.

### Filters

| Filter   | Column           | Example phrasing                    |
|----------|------------------|-------------------------------------|
| city     | `L_City`         | in Irvine, near Newport Beach       |
| minPrice | `L_SystemPrice`  | over $800k, between $800k and $1.2M |
| maxPrice | `L_SystemPrice`  | under $1.5M, up to 900,000          |
| beds     | `L_Keyword2`     | 3-bedroom, 3 br, three bed          |
| baths    | `LM_Dec_3`       | 2.5 bath, 2 ba                      |
| sqft     | `LM_Int2_3`      | 1,800 sq ft, 2000+ sqft             |
| type     | `L_Type_`        | condo, townhome, house, land        |
| pool     | `PoolPrivateYN`  | with a pool (not "no pool")         |
| hasView  | `ViewYN`         | ocean view (not "review")           |
| maxHoa   | `AssociationFee` | HOA under $500, no HOA              |


### Run it

```bash
node --test nl-property-search/tests/parser.test.ts
node nl-property-search/scripts/parse.ts "Show me 3-bedroom condos in Irvine under \$1.5M with a pool"
```

Result: 16 of 16 tests pass (15 test queries and 1 column mapping test).

---

## Week 3: MLS Database Integration

Skill folder: `mls-search/`

This skill takes the Week 2 filters, queries MySQL, and returns property cards. It searches
two tables:

- `rets_property` for active listings, sorted by price, 5 per page.
- `california_sold` for sold homes in a city from the last 12 months.

```
mls-search/
├── SKILL.md            # instructions OpenClaw reads
├── scripts/
│   ├── db.ts           # MySQL connection, reads .env
│   ├── sql.ts          # builds the SQL queries
│   ├── listings.ts     # searchActiveListings() and getSoldComps()
│   ├── format.ts       # turns rows into property cards
│   └── search.ts       # command the skill runs
└── tests/
    └── mls.test.ts     # 12 tests, no database needed
```

---

## Week 4: Conversational Property Search Agent
 
Skill folder: `conversational-search/`
 
This skill turns the one-message search from Week 3 into a conversation. The agent asks
follow-up questions, remembers the user's filters between messages, and updates the results
when the user adds or changes something. It uses the Week 2 parser and the Week 3 search code.
 
```
conversational-search/
├── SKILL.md                    # instructions OpenClaw reads
├── package.json
├── scripts/
│   ├── session.ts              # session memory: getSession, updateSession, clearSession
│   ├── answers.ts              # reads short replies like "Irvine", "1.2M", "a house", "any"
│   ├── agent.ts                # handleMessage(): decides what to ask or searches
│   └── chat.ts                 # command the skill runs, plus a local chat mode
└── tests/
    └── conversation.test.ts    # 19 tests, no database needed
```
 
### How it works
 
1. Every message goes through the Week 2 parser. Short answers like "Irvine" or "1.2M" are
   read using the question the agent just asked.
2. New filters are added to the user's session. The old ones stay.
3. Before the first search, the agent asks for city, budget and home type. It skips a question
   if the user already gave that detail.
4. Then it searches `rets_property` and shows 5 results with address, price, beds/baths and
   photo count.
5. After that, every change runs the search again right away.
| User says | What happens |
|-----------|--------------|
| `Find homes in Irvine` | Saves the city, asks for a budget |
| `Under $1.2M` or `1.2M` | Saves the max price, asks for a home type |
| `any`, `no preference` | Skips that question |
| `just show me` | Searches now with the filters so far |
| `with a pool`, `at least 2 beds` | Adds a filter and searches again |
| `what about Tustin?` | Changes the city, keeps the other filters |
| `any price`, `don't need a pool` | Removes that filter |
| `more` | Next 5 results |
| `start over` | Clears the session |

### Run it

```bash
# Tests
node --test mls-search/tests/mls.test.ts

# Active listings
node mls-search/scripts/search.ts "Show me 3 bedroom condos in Irvine under \$1.5M"
node mls-search/scripts/search.ts --page 2 "Show me 3 bedroom condos in Irvine under \$1.5M"

# Sold homes
node mls-search/scripts/search.ts --sold "What have homes in Pasadena sold for?"
node mls-search/scripts/search.ts --sold --months 24 "What have homes in Pasadena sold for?"
```
