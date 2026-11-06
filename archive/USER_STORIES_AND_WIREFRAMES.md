# Stavvros: User Stories, Personas, Storyboard & Wireframes

> **Reference Context**: Derived from [problem.md](./problem.md) interviews, customer evidence, and FleetHD PRD templates.

---

## 1. User Personas

```
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  PERSONA 1: ALEX (Tech Lead / Staff) │  │  PERSONA 2: MAYA (Feature Developer) │
│  "I need to know how systems connect │  │  "I need accurate cross-team context│
│   and where documentation is lying." │  │   so my AI assistant stops guessing."│
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ Goals:                               │  │ Goals:                               │
│ • Full visibility into team services │  │ • Fast feature delivery with AI     │
│ • Instant detection of code-doc drift│  │ • Understand other teams' APIs       │
│ • Direct graph correction in minutes │  │ • Avoid building against stale docs  │
│ Pain Points:                         │  │ Pain Points:                         │
│ • No single person understands it all│  │ • Blind to payments team's service   │
│ • Constant interruptions explaining  │  │ • AI generates code that breaks in PR│
│ • Reviewing AI PRs takes hours       │  │ • Unclear scope leads to rework      │
└──────────────────────────────────────┘  └──────────────────────────────────────┘

┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  PERSONA 3: DAVID (Product Manager)  │  │  PERSONA 4: ELENA (Engineering VP)   │
│  "My PRDs must stay tied to code, not│  │  "I need visibility into system      │
│   lost in Word docs or drifting."    │  │   health and cross-team dependencies"│
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ Goals:                               │  │ Goals:                               │
│ • Structured PRDs (FleetHD format)   │  │ • High documentation coverage        │
│ • Ensure agents follow strict scope  │  │ • Reduce costly production incidents │
│ • Keep specs in sync with releases   │  │ • Quantify engineering health        │
│ Pain Points:                         │  │ Pain Points:                         │
│ • Word docs are hard to track/share  │  │ • Teams work in isolated silos       │
│ • Overcomplicated docs cause wandering│  │ • High review overhead from AI bugs  │
│ • Specs decay immediately after merge│  │ • Lack of centralized system map     │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

---

## 2. Complaint-to-User-Story Mapping

| Complaint ID | Direct Complaint from `problem.md` | User Story | UI Component / View |
| :--- | :--- | :--- | :--- |
| **C-1: Cross-Team System Blindness** | *"A developer asks an AI assistant to add a 'refund' button... It can't see the payment system, which another team owns or last year's planning doc."* | **US-1**: As an engineering manager or developer, I want to understand how a service works through the graph (architecture, schemas, execution pipeline), so that dependencies are never invisible or opaque. | **Interactive Knowledge Graph View** with Service Blueprints, domain schema viewer, and dependency edges (`CALLS`, `OWNS`). |
| **C-2: Code-Document Drift** | *"Even when planning documents exist, they often fall out of date. An assistant that reads an old document confidently builds for a system that no longer exists."* | **US-2**: As a tech lead, I want the system to parse code and `.md` files and visually flag any discrepancy between what the `.md` doc specifies and what the code implements. | **Drift Badge & Red Edge** in the graph + a **Drift Breakdown Drawer** showing exact code vs doc text diffs. |
| **C-3: Doc Tracking Friction** | *"Word documents are hard to share, locate, and track."* (FleetHD Interviewee) | **US-3**: As a product manager or developer, I want all `.md` files in repositories automatically mapped to their respective services and APIs in one unified view. | **Document Node Inspector** in the dashboard allowing 1-click inspection of raw `.md` content directly linked to implementing code. |
| **C-4: Unclear Scope & Overcomplicated Docs** | *"Documentation is often overcomplicated yet unclear on scope, success criteria, and technical changes, causing agents to wander."* (FleetHD) | **US-4**: As an architect, I want `.md` PRDs parsed into structured sections (Objective, Scope, Success Criteria, Technical Changes) so that requirements are crystal clear. | **FleetHD PRD Section Viewer** displaying parsed scope and criteria when inspecting any document node. |
| **C-5: Conversational Interruption Bottlenecks** | *"When something changes, a developer can update the guide directly in minutes, instead of a teammate stopping their work to explain it."* | **US-5**: As a developer, I want to manually create or edit connections between code elements and `.md` files directly in the UI if an unwritten link exists. | **Interactive Graph Editor**: click-to-connect nodes or add relationship edges directly in the UI. |

---

## 3. Storyboard: The Refund Feature Journey

```mermaid
sequenceDiagram
    autonumber
    actor David as David (Product Manager)
    actor Maya as Maya (Feature Dev)
    actor AI as AI Assistant (Cursor/Claude)
    actor Alex as Alex (Tech Lead)
    participant Stavvros as Stavvros Knowledge Engine
    participant Dash as Stavvros Dashboard UI

    Note over David,Alex: SCENE 1: The Breakdown (Without Stavvros)
    David->>David: Writes PRD-2025-Refund-Policy.md (Specifies sync POST /v1/refunds)
    Note over Alex: Payments team updates code to async v2 webhook; PRD is forgotten!
    Maya->>AI: "Add a refund button to checkout"
    AI-->>Maya: Only sees checkout code. Guesses sync v1 call.
    Maya->>Alex: Opens PR. Alex reviews, code fails in production due to async mismatch!

    Note over David,Alex: SCENE 2: Ingestion & Knowledge Graph Construction
    Stavvros->>Stavvros: Scans code files (*.py) + markdown files (*.md)
    Stavvros->>Stavvros: AST parser extracts routes & FleetHD PRD sections
    Stavvros->>Stavvros: Synthesizes Service Blueprints (execution pipeline, schemas, mission)
    Stavvros->>Stavvros: Drift Engine evaluates AST rules (Version drift detected!)
    Stavvros->>Stavvros: Constructs Knowledge Graph with rich subtitles & red DRIFT_FLAGGED edge

    Note over David,Alex: SCENE 3: Visual Exploration & Code Comprehension
    Alex->>Dash: Opens Stavvros Management Dashboard
    Dash-->>Alex: Displays KPI: 1 Critical Drift Alert, 88.5% Doc Coverage
    Alex->>Dash: Clicks payment-service node on Knowledge Graph
    Dash-->>Alex: Opens Service Architecture Blueprint: Execution Pipeline & Domain Schemas
    Alex->>Dash: Clicks red DRIFT_FLAGGED edge
    Dash-->>Alex: Node Inspector opens: Side-by-side Diff (Doc v1 Sync vs Code v2 Async)
    Alex->>Dash: Clicks "Connect / Reconcile" -> Updates graph link in 30 seconds
    Maya->>Dash: Inspects PRD-2025 & Payments Service map
    Maya->>Maya: Successfully implements checkout refund button with correct async webhook!
```

---

## 4. Wireframe Diagrams

### Wireframe 1: Global Management Shell & KPI Header
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [⬡ STAVVROS]   Workspace: [ stavvros-workspace ▾ ]                      Status: ● Ingestion Active (Live)│
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  MANAGEMENT OVERVIEW                                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  DOC COVERAGE SCORE  │  │  ACTIVE DRIFT ALERTS │  │  INDEXED ENTITIES    │  │  CROSS-TEAM SERVICES │  │
│  │       88.5%          │  │       1 Critical     │  │  14 Nodes | 18 Edges │  │  2 Services | 2 Teams│  │
│  │  [██████████░░] +4%  │  │  ⚠ PRD-2025 vs Code  │  │  (Docs, APIs, Teams) │  │  Checkout ➔ Payments │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 2: Interactive Knowledge Graph Explorer (With Rich Node Badges)
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  KNOWLEDGE GRAPH EXPLORER                                                                                │
│  [🔍 Search nodes, APIs, docs...]   Layout: [ COSE Physics ▾ ]   [+ Connect Entities]   [⟳ Rebuild Graph]│
│  Filters: [☑ Teams]  [☑ Services]  [☑ APIs]  [☑ Documents]  [☑ Flagged Drift Only]                       │
├───────────────────────────────────────────────────────────────────────────────────┬──────────────────────┤
│                                                                                   │ NODE INSPECTOR       │
│           (🟣 Payments Team)                                                      │ ──────────────────── │
│                  │                                                                │ [🔵 SERVICE]         │
│                OWNS                                                               │ payment-service      │
│                  ▼                                                                │ ⚡ Kafka • Ledgers   │
│         ┌──────────────────────┐                                                  │                      │
│         │   payment-service    │ ◀──────CALLS────── ┌──────────────────────┐      │ Owning Team:         │
│         │  ⚡ Kafka • Ledgers  │                    │   checkout-service   │      │ Payments Platform    │
│         └──────────────────────┘                    │  FastAPI • 3 Routes  │      │                      │
│                  │                                  └──────────────────────┘      │ [Service Blueprint]  │
│              IMPLEMENTS                                        │                  │ [Domain Schemas]     │
│                  │                                            OWNS                │ [Source Code Files]  │
│                  ▼                                             ▼                  │                      │
│       (🟢 POST /v2/refunds/async)                      (🟣 Checkout Team)         │ Execution Flow:      │
│                  ▲                                             │                  │ 1. Validate Idempot  │
│                  │                                          SPECIFIES             │ 2. Kafka Event Emit  │
│             DRIFT_FLAGGED                                      │                  │ 3. Return HTTP 202   │
│             (Blinking Red)                                     ▼                  │                      │
│                  └────────────────────────────────(🟡 PRD-2025-Refund-Policy.md)  │                      │
└───────────────────────────────────────────────────────────────────────────────────┴──────────────────────┘
```

### Wireframe 3: Service Architecture Blueprint Drawer (Understanding Code via Graph)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE BLUEPRINT: payment-service                                           [✕] │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Owning Team: 🟣 Payments Platform Team (#payments-core)                          │
│ Repository: stavvros-workspace/services/payment-service                          │
│ Tech Stack: [ FastAPI ]  [ Python 3.14 ]  [ Kafka Event Stream ]  [ Ledger DB ]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [ Tab 1: How It Works ]  [ Tab 2: Domain Schemas ]  [ Tab 3: Source Code ]      │
├──────────────────────────────────────────────────────────────────────────────────┤
│  SERVICE MISSION & ARCHITECTURE:                                                 │
│  Centralized payment orchestration gateway managing credit card capture,         │
│  asynchronous customer refund workflows, and double-entry transaction ledgers.   │
│                                                                                  │
│  REQUEST EXECUTION PIPELINE (How Data Flows):                                    │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. INGESTION       Receive POST /v2/refunds/async with Idempotency Key     │  │
│  │        │                                                                   │  │
│  │ 2. VALIDATION      Validate 30-day window & manager approval threshold     │  │
│  │        │                                                                   │  │
│  │ 3. EVENT EMIT      Produce Kafka event: "payment.refund.initiated"         │  │
│  │        │                                                                   │  │
│  │ 4. DISPATCH        Return HTTP 202 Accepted to caller (checkout-service)   │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  EXPOSED CAPABILITIES (3 Routes):                                                │
│  • POST /v2/charges                     (Credit Card Capture)                    │
│  • POST /v2/refunds/async               (Async Event Refund - Kafka)             │
│  • GET  /v2/transactions/{id}           (Ledger Settlement Query)                │
│                                                                                  │
│  ACTIVE CROSS-SERVICE CONNECTIONS:                                               │
│  ◀ Inbound: checkout-service calls POST /v2/refunds/async                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe 4: Domain Schemas Viewer (Tab 2 of Service Blueprint)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ DOMAIN SCHEMAS & MODELS: payment-service                                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 📦 Model: RefundRequest                                                          │
│   • order_id: str (Required)                                                     │
│   • amount_cents: int (Required)                                                 │
│   • currency: str (Default: "USD")                                               │
│   • reason: str                                                                  │
│   • manager_approval: Optional[bool] (Default: False)                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 📦 Model: LedgerEntry                                                            │
│   • entry_id: str                                                                │
│   • account_id: str                                                              │
│   • amount_cents: int                                                            │
│   • entry_type: str ("CREDIT" | "DEBIT")                                         │
│   • timestamp: str                                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Future Roadmap: LLM & Jev for Drift Classification

For future iterations beyond deterministic AST rules, the system is designed to integrate:
1. **Jev (Jevons Paradox Architectural Drift Classifier)**:
   - Tracks architectural coupling over time. As calling microservices becomes easier, consumption increases exponentially, creating hidden circular dependencies and architectural degradation. Jev analyzes graph connectivity to flag systemic risk.
2. **LLM-Powered Semantic Drift Classifier**:
   - Compares Git diffs directly against PRDs to classify drift intent:
     - **Intentional Architecture Upgrade**: Generates an automated Pull Request to patch the `.md` documentation.
     - **Accidental Regression**: Alerts the engineer that code broke business rules established in the PRD.
