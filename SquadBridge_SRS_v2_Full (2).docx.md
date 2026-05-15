

**SOFTWARE REQUIREMENTS SPECIFICATION**

**SquadBridge**

*Nigeria's Conversational Economic Operating System*

Version 2.0  |  May 2026  |  Squad Hackathon 3.0

| Infrastructure | Microsoft Azure (App Service, SQL Database, Redis, Functions) |
| :---- | :---- |
| **Backend** | Node.js \+ Express.js |
| **Frontend** | React 18 \+ Next.js 14 (App Router) \+ TailwindCSS |
| **Primary Interface** | Web Dashboard (Desktop \+ Mobile Responsive) |
| **Secondary Channels** | WhatsApp (notifications), USSD \*556\# (Africa's Talking Free Tier) |
| **Voice Services** | Spitch TTS/STT (English, Yoruba, Hausa, Pidgin) |
| **Payments** | Squad by HabariPay (all financial events) |

# **TABLE OF CONTENTS**

* 1\.  Introduction

* 2\.  Overall Description

* 3\.  System Features & Functional Requirements

*     3.1  Flow 3: School Fee Collection (MVP)

*     3.2  Flow 1: Graduate / Job Seeker (Phase 3\)

*     3.3  Flow 2: Artisan / Trader (Phase 2\)

*     3.4  Credit Scoring Engine

* 4\.  External Interface Requirements

*     4.1  Web Dashboard — Detailed UI/UX Specification

*     4.2  WhatsApp Channel

*     4.3  USSD Channel (Africa's Talking)

*     4.4  Spitch Voice Services

* 5\.  Technical Architecture

*     5.1  System Architecture Diagram

*     5.2  Express.js Backend Architecture

*     5.3  Database Schema

*     5.4  Azure Infrastructure

*     5.5  API Endpoints Reference

* 6\.  Non-functional Requirements

* Appendix A: Squad API Master Reference

# **1\.  INTRODUCTION**

## **1.1  PURPOSE**

This SRS defines every functional requirement, technical architecture decision, user flow, UI screen, and integration specification for SquadBridge — a conversational AI-powered economic operating system that formalizes Nigeria's informal economy through financial inclusion.

Nigeria's informal economy accounts for up to 65% of GDP and employs over 85% of the labour force, yet it is invisible to the formal financial system: 39 million traders have no transaction history, 1.7 million graduates enter the workforce annually with no verifiable income, and 140,000+ schools and clinics manage cash flows on paper. SquadBridge converts every Squad transaction into a creditworthiness data point.

  *Core thesis: Formalization does not require a bank branch or a government document. It requires a Squad Virtual Account, a web/conversational interface, and a machine learning engine that turns behavioral transaction data into credit access.*

## **1.2  DOCUMENT CONVENTIONS**

| Term | Meaning |
| :---- | :---- |
| **MUST** | Mandatory — system is incomplete without it |
| **SHOULD** | Highly desirable — implement if feasible |
| **MAY** | Optional / future phase |
| **MVP** | Hackathon deliverable scope |
| **BVN** | Bank Verification Number |
| **NDPA** | Nigeria Data Protection Act 2023 |
| **TTS/STT** | Text-to-Speech / Speech-to-Text (Spitch) |
| **USSD** | \*556\# menu via Africa's Talking free tier |

## **1.3  INTENDED AUDIENCE**

* Development Team: Node.js/Express.js backend, React/Next.js frontend, Azure DevOps

* QA Engineers: functional, integration, and UAT testing

* Squad Hackathon 3.0 Judges: technical evaluation panel

* Business Stakeholders: Squad by HabariPay, potential investors

## **1.4  PROJECT SCOPE**

**MVP (Hackathon — Flow 3: School Fee Collection):**

* Web dashboard for school bursars (React/Next.js, Azure-hosted)

* BVN validation and Squad Virtual Account provisioning

* P\&L auto-generation with recommendations

* Bulk Payment Links per student (Squad API)

* Real-time webhook-driven collections dashboard

* Automated payroll via Squad Bulk Transfer on schedule

* Cash flow forecasting (30/60/90-day projections)

* WhatsApp notifications (Meta Business API, utility tier only)

* USSD \*556\# menu (Africa's Talking free tier)

* Spitch TTS voice announcements

**Out-of-Scope for MVP:**

* Flow 1: Graduate job marketplace (Phase 3\)

* Flow 2: Trader escrow system (Phase 2\)

* Live XGBoost credit scoring on production data (Phase 3\)

## **1.5  REFERENCES**

* Squad API Docs: https://docs.squadco.com/

* Express.js Documentation: https://expressjs.com/

* Next.js 14 App Router: https://nextjs.org/docs

* Microsoft Azure Docs: https://docs.microsoft.com/azure

* Africa's Talking USSD: https://developers.africastalking.com/docs/ussd

* Spitch API: https://spitch.ai/docs

* Nigeria Data Protection Act 2023

* IEEE Std 830-1998 SRS Guidelines

# **2\.  OVERALL DESCRIPTION**

## **2.1  PRODUCT PERSPECTIVE**

SquadBridge is a coordination layer — not a standalone fintech app — that amplifies Squad's existing payment infrastructure. Every financial event flows through Squad. Every Squad transaction fires a webhook. Every webhook is a data point that builds creditworthiness.

The platform addresses five compounding failures of previous informal-economy tech platforms in Nigeria:

* Behavioural Trust Deficit: Platforms replaced social trust with algorithms. SquadBridge preserves negotiation culture via on-platform AI-mediated bargaining.

* Skill Verification Crisis: Igbo Igba-Boi apprenticeship produces no machine-readable credentials. SquadBridge issues verification badges from on-platform behavior.

* Prohibitive WhatsApp API costs: Nigeria marketing messages cost $0.083/msg. SquadBridge uses utility-only inbound flows (\~$0.012/msg) — 85% cost reduction.

* Decoupled DPI: NIN and NIBSS are siloed. SquadBridge bypasses via Squad BVN-linked sub-merchant onboarding.

* NDPA 2023 Exposure: All sensitive data stored on Azure (South Africa North / UK South). WhatsApp used as UI only, not data store.

## **2.2  PRODUCT FEATURES**

| Feature | Description | Phase |
| :---- | :---- | :---- |
| Web Dashboard | Primary interface — React/Next.js with real-time data via WebSocket | MVP |
| School Onboarding | BVN validation, Squad Virtual Account, P\&L generation | MVP |
| Payment Links | Per-student fee invoices auto-generated via Squad API | MVP |
| Webhook Processor | Real-time payment events update dashboard instantly | MVP |
| Automated Payroll | Squad Bulk Transfer on schedule via Azure Functions | MVP |
| Cash Flow Forecast | 30/60/90-day projections using exponential smoothing | MVP |
| WhatsApp Alerts | Payment and payroll notifications (utility tier) | MVP |
| USSD \*556\# | Balance, collections, payout via Africa's Talking free tier | MVP |
| Spitch Voice | TTS/STT in English, Yoruba, Hausa, Pidgin | MVP |
| Trader Escrow | Squad Dynamic VA per transaction — anti-leakage | Phase 2 |
| Graduate Marketplace | AI gig matching and Squad stipend disbursement | Phase 3 |
| XGBoost Credit Score | 300–850 score from Squad webhook transaction data | Phase 3 |

## **2.3  USER CLASSES AND CHARACTERISTICS**

| User Class | Role | Device/Channel | Phase |
| :---- | :---- | :---- | :---- |
| School Bursar | Manage fees, payroll, cash flow forecasting | Desktop Web (primary) | MVP |
| Parent / Guardian | Pay school fees via payment link | Any device — Payment Link | MVP |
| Feature Phone User | Check balance, view collections | USSD \*556\# (Africa's Talking) | MVP |
| Trader / Artisan | Post jobs, receive payments, build credit | Web Dashboard \+ WhatsApp | Phase 2 |
| Graduate | Find gigs, earn income, build credit history | Web Dashboard \+ WhatsApp | Phase 3 |
| System Admin | Monitor platform, resolve exceptions | Admin Dashboard (web) | MVP |

## **2.4  OPERATING ENVIRONMENT**

**Backend — Express.js (Node.js):**

* Runtime: Node.js v20 LTS

* Framework: Express.js 4.x with middleware stack

* ORM: Sequelize (for Azure SQL Database)

* Job Scheduler: node-cron \+ Azure Functions (Node.js runtime) for payroll and forecasting

* Message Queue: Azure Service Bus for webhook deduplication

* Websocket: Socket.io for real-time dashboard updates

* NLP: HuggingFace Inference API (DistilBERT, called via HTTP)

**Frontend — React/Next.js:**

* Framework: Next.js 14 (App Router, Server Components)

* UI Library: React 18 \+ TailwindCSS

* Charts: Recharts (collections progress, cash flow forecast)

* State Management: Zustand \+ React Query

* Auth: NextAuth.js with Azure AD provider

* WebSocket Client: Socket.io-client for live dashboard

**Microsoft Azure Infrastructure:**

* App Service: B2 Standard — hosts Express.js \+ Next.js containers (auto-scale 2–5 instances)

* SQL Database: Azure SQL Server — Standard S2 (daily backup, point-in-time restore 7 days)

* Redis Cache: Azure Cache for Redis C1 — sessions, webhook dedup, real-time state

* Functions: Azure Functions v4 (Node.js 20\) — scheduled payroll, nightly forecasting

* Blob Storage: Standard LRS — Spitch audio files, document storage

* Service Bus: Standard tier — webhook idempotency queue

* Key Vault: All API secrets stored here, never in code

* Application Insights: Full telemetry, custom dashboards, alerting

* Container Registry: Azure Container Registry — Docker images for CI/CD

## **2.5  DESIGN AND IMPLEMENTATION CONSTRAINTS**

* NDPA 2023: All personal data on Azure South Africa North or UK South. No cross-border transfer without explicit consent. Consent timestamped and retained indefinitely.

* Squad API (Mandatory): Hackathon rules disqualify solutions with no meaningful Squad API integration.

* WhatsApp Utility Only: No outbound marketing messages ($0.083/msg Nigeria rate). All messages are user-triggered or utility alerts (\~$0.012/msg).

* BVN Privacy: Raw BVN never stored. Only Squad-validated sub-merchant ID retained post-verification.

* Express.js Architecture: RESTful API pattern, middleware-based, no monolithic controllers. Each route group is a separate Express Router module.

* Dashboard Performance: Time-to-interactive \< 2 seconds. WebSocket updates within 500ms of Squad webhook receipt.

## **2.6  ASSUMPTIONS AND DEPENDENCIES**

* Users have smartphone/desktop with internet (web/WhatsApp) or a GSM feature phone (USSD)

* Squad APIs remain stable and sandbox environment accessible during development

* Schools have a valid BVN-linked bank account for receiving payroll and transfers

* Azure free-tier / student credits sufficient for hackathon demo environment

# **3\.  SYSTEM FEATURES AND FUNCTIONAL REQUIREMENTS**

## **3.1  FLOW 3: SCHOOL FEE COLLECTION (MVP — HACKATHON)**

  *Rationale: Schools have predictable financial events. Squad Payment Links \+ Gateway provide a complete demonstrable collection cycle. P\&L auto-generation creates immediate impact for judges without requiring ML infrastructure.*

### **STEP 1 — Institution Onboarding (Web Dashboard)**

The school bursar visits the SquadBridge web app at app.squadbridge.com. On the onboarding screen they enter school details through a multi-step form.

**Data collected:**

* School name, address, state/LGA

* BVN (11 digits — validated format client-side before submission)

* Contact phone number

* Number of students per class/year

* Fee per term (₦)

* Number of staff and average monthly salary

**Backend process (Express.js):**

1. POST /api/v1/schools/onboard receives the form payload

2. Middleware validates BVN format and sanitizes inputs

3. Calls Squad Aggregator/Sub-merchant API with BVN for identity verification

4. On success, calls Squad POST /virtual-account to create NUBAN

5. Inserts school record into Azure SQL Database via Sequelize

6. Returns { school\_id, nuban, status: "onboarded" } to the frontend

7. Frontend redirects bursar to the main dashboard

8. WhatsApp notification sent: "Welcome to SquadBridge\! Your account number is \[NUBAN\]"

**REQ-001 Requirements:**

* MUST validate BVN format (11 digits) before Squad API call

* MUST call Squad Aggregator/Sub-merchant API for KYC

* MUST create Squad Virtual Account (NUBAN) within 5 seconds

* MUST persist school data in Azure SQL Database

* MUST return school\_id and NUBAN to dashboard

### **STEP 2 — P\&L Auto-Generation**

Immediately after onboarding, the system calculates and displays the school's financial health on the dashboard.

**Calculation logic (Express.js /api/v1/schools/:id/pl):**

* annual\_income \= fee\_per\_term × total\_students × 3 terms

* salary\_expense \= avg\_salary × staff\_count × 12 months

* transport\_estimate \= ₦3,000 × (0.8 × students) × 12

* feeding\_estimate \= ₦2,500 × (0.7 × students) × 12

* utilities\_estimate \= ₦150,000 × 12

* maintenance\_estimate \= ₦100,000 × 12

* net\_position \= annual\_income − total\_expenses

**Output displayed on dashboard:**

* Annual income card (green if positive, red if deficit)

* Expense breakdown doughnut chart

* Net position prominently displayed

* Recommendation if deficit: "Consider increasing fees to ₦65,000 or increasing enrolment by 30 students"

**REQ-002 Requirements:**

* MUST calculate all expense categories on onboarding completion

* MUST flag deficit with ≥ 1 actionable recommendation

* MUST display P\&L on the Overview page of the dashboard

### **STEP 3 — Bulk Payment Link Generation**

The bursar navigates to the Collections page and uploads or enters a student list. The system calls Squad's Payment Links API to generate a unique, trackable link per student.

**Frontend (Collections page):**

* CSV upload OR manual entry of student names and fees

* "Generate All Links" button triggers backend call

* Progress bar shows generation status for large cohorts (150+ students)

**Backend process (Express.js):**

9. POST /api/v1/schools/:id/payment-links receives student array

10. Iterates each student, calls Squad Payment Links API per student

11. Stores { student\_id, squad\_link\_id, payment\_url, amount, status: "pending" } in Azure SQL

12. Returns full links array to frontend

13. Frontend renders link table with one-click "Send via WhatsApp" per row

**REQ-003 Requirements:**

* MUST support batch generation for 150+ students within 60 seconds

* MUST store link-to-student mapping in database

* MUST display all links in collections table with status indicator

* SHOULD enable one-click WhatsApp share per student link

### **STEP 4 — Fee Collection via Squad Gateway**

Parents receive their child's unique payment link. They click it and pay via card, bank transfer, or USSD on Squad's hosted payment page. No app download required.

**Payment methods available on Squad Gateway:**

* Debit/credit card (Visa, Mastercard, Verve)

* Bank transfer (instant NIP)

* USSD — parent dials \*code\# on any mobile network

* Squad QR code (for walk-in payments at school)

**What happens on payment:**

14. Squad processes the payment and charges the parent

15. Funds land instantly in the school's Squad Virtual Account (NUBAN)

16. Squad fires a webhook to POST /webhooks/squad/payment (see Step 5\)

17. Dashboard updates in real-time

### **STEP 5 — Real-Time Webhook Processing**

This is the engine that makes the dashboard live. Every Squad payment event triggers an instant cascade of updates.

**Express.js webhook handler:**

POST /webhooks/squad/payment

* Middleware verifies HMAC-SHA256 signature from Squad headers

* Extracts: transaction\_id, amount, payment\_link\_id, timestamp

* Checks Redis for duplicate (idempotency key \= transaction\_id)

* If new: writes idempotency key to Redis with 24hr TTL

* Looks up student record by payment\_link\_id in Azure SQL

* Updates student.fee\_status \= "Paid" and school.collected\_amount \+= amount

* Emits Socket.io event to connected dashboard clients

* Queues WhatsApp notification: "₦65,000 received from Adaeze Obi. Total: ₦4.7M"

* Responds HTTP 202 Accepted within 2 seconds

**REQ-004 Requirements:**

* MUST verify Squad HMAC-SHA256 signature on every webhook

* MUST implement Redis-based idempotency to prevent double-counting

* MUST push real-time Socket.io event to connected dashboard

* MUST respond HTTP 202 within 2 seconds

### **STEP 6 — Automated Payroll Disbursement**

The bursar configures payroll once. Every month on the configured date, the system automatically transfers salaries to all staff via Squad's Bulk Transfer API.

**Payroll configuration (Payroll page on dashboard):**

* Set payroll day (e.g., 20th of every month)

* Enter staff list: name, bank account, bank code, salary amount

* Preview total payroll liability

* "Schedule Payroll" confirms and saves

**Azure Functions timer (Node.js) — runs on configured day:**

18. Reads payroll config from Azure SQL for all schools with payroll\_day \= today

19. Fetches each school's current Squad balance via Squad API

20. If balance \>= total\_payroll: calls Squad Transfer API (Bulk) with full staff array

21. If balance \< total\_payroll: sends WhatsApp alert and pauses execution

22. Logs all transfer\_ids and statuses in Azure SQL

23. Sends WhatsApp confirmation: "Payroll complete. 20 staff paid ₦3.8M."

24. Optionally generates Spitch TTS audio of summary

**REQ-005 Requirements:**

* MUST execute on scheduled day via Azure Functions timer

* MUST verify balance before executing transfers

* MUST call Squad Bulk Transfer API for all staff simultaneously

* MUST handle partial payroll failure gracefully (partial success \= log \+ alert)

* MUST send WhatsApp confirmation with per-staff breakdown

### **STEP 7 — Cash Flow Forecasting**

An Azure Function runs every night, updating the school's projected balance for the next 30, 60, and 90 days.

**Node.js forecasting logic:**

* Fetches all payment events for the school from Azure SQL

* Calculates daily collection rate from actual webhook data

* Applies exponential smoothing (α \= 0.3) to smooth variance

* Projects forward 30, 60, 90 days

* Deducts known payroll obligations from projected balance

* Generates confidence bounds (+/- 15%)

* Stores forecast in Azure SQL with timestamp

* Dashboard Forecast page displays as Recharts line chart

**REQ-006 Requirements:**

* MUST run nightly via Azure Functions

* MUST project 30/60/90-day balance

* MUST deduct known payroll from projections

* MUST display as line chart with confidence band

* MUST flag projected shortfalls with recommendations

### **STEP 8 — USSD Access (\*556\#)**

School bursars or traders with feature phones dial \*556\# to access a lightweight text menu.

**Africa's Talking USSD flow (Express.js handler):**

POST /ussd/callback  (Africa's Talking posts to this endpoint)

* Parses: sessionId, phoneNumber, text (accumulated input)

* Empty text → show Main Menu

* Input "1" → fetch school balance from Azure SQL, return END response

* Input "2" → fetch collections stats, return END response

* Input "3" → initiate payout request, return CON for amount entry

* Input "4" → return help text END response

**Menu structure:**

CON Welcome to SquadBridge

1\. Check Balance

2\. Collections Summary

3\. Request Payout

4\. Help

0\. Exit

* All responses return within 10 seconds (Africa's Talking SLA requirement)

### **STEP 9 — Spitch Voice Notifications**

After payroll execution and major balance events, the system generates audio announcements via Spitch TTS.

**Express.js Spitch integration:**

POST https://api.spitch.co/v1/tts

* Payload: { text: "Payroll complete. Twenty staff paid three-point-eight million naira.", language: "en-NG", voice: "female", format: "mp3" }

* Response: { audio\_url, duration\_ms }

* Audio file saved to Azure Blob Storage

* URL returned to dashboard for inline playback button

* SHOULD support yo-NG (Yoruba), ha-NG (Hausa), pcm-NG (Pidgin) based on user language preference

## **3.2  FLOW 1: GRADUATE / JOB SEEKER → INCOME → CREDIT BUILDING (Phase 3\)**

### **STEP 1 — Discovery**

Graduate encounters SquadBridge via WhatsApp link, campus MLSA community, 3MTT coordinator, or an SMS broadcast. They visit app.squadbridge.com/graduate or send 'Hi' to the SquadBridge WhatsApp number.

### **STEP 2 — Conversational Onboarding**

AI agent greets in English or Pidgin: 'Wetin you dey find? Work? Training? Make we start.' Collects BVN, date of birth, phone number, and preferred language. All within the web interface or WhatsApp chat — no separate app required.

### **STEP 3 — KYC & Squad Sub-Merchant Creation**

Backend calls Squad Aggregator/Sub-merchant API. BVN is cross-referenced against name, DOB, and phone for instant identity validation. A Squad Virtual Account (NUBAN) is provisioned in real time.

### **STEP 4 — Skill Assessment & Matching**

AI asks: 'What can you do? Data entry? Customer service? Excel?' NLP engine (DistilBERT) classifies skills and matches to available gigs posted by traders on the platform, or to relevant 3MTT / LearnToEarn training cohorts.

### **STEP 5 — Training Stipend via Squad Transfer**

If enrolled in 3MTT, the ₦75,000/month government stipend is disbursed directly to the graduate's Squad Virtual Account via Squad Transfer API. Every disbursement fires a webhook event captured by the credit engine.

### **STEP 6 — Gig Matching & Payment**

Graduate is matched to trader gigs (e.g., data entry at ₦3,000/day). On completion the trader triggers payment via the SquadBridge dashboard. Funds transfer to the graduate's Squad account via Transfer API. Webhook fires and updates the graduate's credit profile.

### **STEP 7 — Credit Score Generation**

After 90 days: ₦225,000 (stipend) \+ ₦30,000+ (gigs) \= ₦255,000+ in verified Squad transaction history. XGBoost model scores approximately 650/850. Graduate qualifies for a ₦100,000 micro-loan via LAPO Microfinance Bank or AB Microfinance.

**Squad APIs used in Flow 1:**

| Squad API | Use in Flow 1 |
| :---- | :---- |
| POST /virtual-account | Unique NUBAN for each graduate on onboarding |
| Aggregator/Sub-merchant | BVN-linked identity verification |
| Transfer API (single) | Training stipends and gig earnings to graduate |
| Payment Gateway | Trader-clients pay for gig work via card/bank |
| Webhooks | Every transaction feeds the ML credit engine in real time |

## **3.3  FLOW 2: ARTISAN / TRADER → FORMALIZATION → WORKING CAPITAL (Phase 2\)**

### **STEP 1 — Onboarding**

Trader visits app.squadbridge.com/trader or sends 'Hi' to SquadBridge WhatsApp. AI agent: 'Wetin you dey sell? Wey you dey?' Collects BVN, business type, and location. Squad Sub-merchant API provisions a business Virtual Account immediately.

### **STEP 2 — Posting a Job or Listing a Service**

Via dashboard or WhatsApp: 'You wan find worker? Tell me the job.' Voice note or text is parsed by the NLP engine (DistilBERT via HuggingFace Inference API), which auto-generates a structured job posting visible to graduates in the matching pool.

### **STEP 3 — AI-Mediated Negotiation (Anti-Leakage Design)**

Client and artisan negotiate price freely within the SquadBridge chat interface. This preserves Nigeria's cultural bargaining dynamic — the mechanism that destroyed earlier platforms when removed — while keeping both parties within the ecosystem.

  *The anti-leakage insight: Once both parties are in the SquadBridge escrow flow, the platform's value is not the introduction — it is the financial safety net. Neither party has an incentive to go off-platform because the escrow only releases on confirmed completion.*

### **STEP 4 — Escrow via Squad Dynamic Virtual Account**

Once a price is agreed, SquadBridge calls Squad Virtual Account API to generate a transaction-specific Dynamic Virtual Account labelled with the merchant name. The client transfers the agreed amount to this account. Squad holds funds in escrow. A real-time webhook notifies both parties that funds are secured — the artisan can now begin work with confidence.

### **STEP 5 — Completion & Disbursement**

On job completion and client confirmation (both parties confirm via dashboard or WhatsApp), SquadBridge calls Squad Transfer API to release funds to the artisan's primary Squad account, minus the 2–3% platform fee. This eliminates both artisan absconding risk and client payment refusal after delivery.

### **STEP 6 — Customer Inflows via Payment Link**

Traders collect from downstream customers via Squad Payment Links shared over WhatsApp. Customers pay via card, bank transfer, or USSD. Each inflow is captured by the webhook engine and added to the trader's credit profile.

### **STEP 7 — Credit Score & Working Capital Loan**

After 90 days: ₦500,000+ in Squad transactions. XGBoost scores approximately 720/850. Trader qualifies for ₦100,000–₦500,000 working capital loan via LAPO or FairMoney. Loan repayments are auto-deducted from future Squad earnings via Transfer API before payout.

**Squad APIs used in Flow 2:**

| Squad API | Use in Flow 2 |
| :---- | :---- |
| POST /virtual-account | Business account \+ dynamic escrow accounts per transaction |
| Aggregator/Sub-merchant | BVN-linked trader identity and compliance |
| Transfer API (single) | Escrow release to artisan on completion |
| Payment Gateway | Customer payments via card/bank/USSD |
| Payment Links API | Shareable service invoices for trader's clients |
| Webhooks | Escrow confirmation; credit scoring data feed |
| Dynamic Virtual Account | Transaction-specific escrow (anti-leakage mechanism) |

## **3.4  CREDIT SCORING ENGINE (Phase 3\)**

SquadBridge's credit scoring system is the platform's most significant structural contribution. By routing all financial activity through Squad and capturing every event via webhooks, it accumulates a granular transaction dataset that formal banks cannot replicate.

**Data inputs (all from Squad webhooks):**

| Feature Category | Extracted Features |
| :---- | :---- |
| Income frequency | Inbound transactions per week; days between payments |
| Income consistency | Coefficient of variation of inbound amounts |
| Amount trajectory | Month-over-month change in avg transaction value |
| Recipient diversity | Unique outbound recipients (business scaling signal) |
| Platform engagement | Job completion rate, escrow usage, on-platform negotiation |
| Account maturity | Days since Squad Virtual Account was created |
| Repayment behaviour | Days early/late vs scheduled repayment date |

**Model: XGBoost, output score 300–850 (Nigerian bureau convention)**

| User Type | 90-Day Squad History | Score → Loan Access |
| :---- | :---- | :---- |
| Graduate | ₦255,000 across 50+ events | 650/850 → ₦100K via LAPO MFB |
| Trader | ₦500,000 across 120+ events | 720/850 → ₦100K–500K via AB MFB / FairMoney |
| School | ₦15M+ in 90 days | Institutional revenue-based advance |

# **4\.  EXTERNAL INTERFACE REQUIREMENTS**

## **4.1  WEB DASHBOARD — DETAILED UI/UX SPECIFICATION**

### **4.1.1  Design System**

**Colour Palette:**

* Primary: \#1F4E79 (Navy Blue) — navigation, primary buttons, headings

* Secondary: \#2E75B6 (Azure Blue) — subheadings, links, accents

* Accent Green: \#70AD47 — positive values, "Paid" status, progress bars

* Accent Red: \#FF0000 / \#C00000 — deficit indicators, "Overdue" status

* Accent Yellow: \#FFC000 — warnings, "Partial" status badges

* Background: \#F8F9FA — page background

* Surface: \#FFFFFF — cards, modals, tables

* Text Primary: \#212529 — body text

* Text Secondary: \#6C757D — labels, placeholders

**Typography:**

* Font Family: Inter (Google Fonts — loaded via Next.js font optimization)

* Headings: Inter 700 (bold), 24–36px

* Body: Inter 400 (regular), 14–16px

* Labels: Inter 500 (medium), 12–13px, uppercase

* Monospace (account numbers): JetBrains Mono or Courier New

**Component Library:**

* Built with TailwindCSS utility classes — no external UI framework

* Custom component set: Card, Button, Badge, Table, Modal, Chart, Sidebar, TopBar

* Icons: Heroicons v2 (MIT licensed SVGs)

### **4.1.2  Global Layout**

The dashboard uses a fixed sidebar \+ top bar \+ scrollable main content layout.

**Top Navigation Bar (fixed, full width):**

* Left: SquadBridge logo \+ school name

* Center: Search bar (search students, transactions)

* Right: NUBAN account number badge | Notifications bell (live count) | User avatar \+ dropdown (Profile, Settings, Logout)

**Left Sidebar (fixed, 240px wide, collapsible):**

* Overview (home icon)

* Collections (bank icon)

* Payroll (users icon)

* Forecast (chart icon)

* Audit Log (document icon)

* Settings (gear icon)

* \--- separator \---

* Help & Support

**Main Content Area:**

* 768px max-width container, centered

* Breadcrumb trail under top bar

* Page-specific content

### **4.1.3  Onboarding Screens**

Multi-step wizard — 4 steps, progress indicator at top.

**Step 1 — Welcome:**

* Hero illustration (school building graphic)

* Headline: "Automate your school's finances. Start in 3 minutes."

* Subtext: "Collect fees, run payroll, and forecast cash flow — all from one dashboard."

* CTA button: "Get Started →"

**Step 2 — School Details:**

* Input: School name (text)

* Input: State (dropdown — all 36 states \+ FCT)

* Input: LGA (auto-populated based on state)

* Input: Phone number (with \+234 flag prefix)

* Input: Number of students (number)

* Input: Fee per term in ₦ (number with naira symbol prefix)

* Input: Number of staff (number)

* Input: Average monthly salary ₦ (number)

**Step 3 — Identity Verification:**

* Input: BVN (11 digits, masked after entry)

* Notice: "Your BVN is used only for identity verification. We never store it." (with padlock icon)

* On submit: loading spinner "Verifying identity with Squad..."

* Success: green tick \+ "Identity verified"

* Failure: red alert \+ specific error message

**Step 4 — Account Created:**

* Large checkmark animation

* Your Squad Account Number: \[NUBAN\] (large monospace font, copy button)

* P\&L preview card: Annual income, total expenses, net position

* Button: "Go to Dashboard →"

### **4.1.4  Overview Page (Home)**

The main dashboard screen. Updates in real time via Socket.io as payments arrive.

**Top Row — 4 Metric Cards:**

* Card 1: Squad Balance — large ₦ amount, green arrow if increasing, "Live" badge

* Card 2: Total Collected This Term — ₦ amount \+ "X of Y students paid" below

* Card 3: Next Payroll — date \+ ₦ total amount, countdown if \< 7 days

* Card 4: End-of-Term Forecast — projected balance in 90 days

**Middle Row — Collection Progress:**

* Horizontal progress bar (green fill): "72 / 150 students paid (48%)"

* Below bar: ₦ collected vs ₦ expected this term

* "Send Reminders" button (sends WhatsApp link to all unpaid students' parents)

**Bottom Row — Two Panels:**

* Left: Recent Payments table (5 rows: student name, amount, time, status badge)

* Right: 30-day mini forecast chart (Recharts line chart, small)

**Alert Banner (conditional):**

* Appears if projected balance will be below payroll threshold

* Yellow: "At current pace, you may not cover payroll on the 20th. \[Review Forecast\]"

### **4.1.5  Collections Page**

Detailed view of all students and payment status.

**Header Row:**

* Page title: "Fee Collections — Term 1 2026"

* "Generate Payment Links" button (primary, blue)

* "Import Students" button (secondary — CSV upload)

* "Send All Reminders" button (sends WhatsApp to all unpaid parents)

**Filter Bar:**

* Search: type student name

* Filter dropdown: All | Paid | Unpaid | Partial

* Sort: Name A-Z | Amount ↑ | Date Paid ↓

**Student Table (full width):**

* Columns: \# | Student Name | Class | Amount Due | Amount Paid | Balance | Status Badge | Payment Link | Actions

* Status badges: green "Paid" | red "Unpaid" | yellow "Partial"

* Payment Link column: shows shortened link with "Copy" and "Share" icons

* Actions: "Send Reminder" (WhatsApp), "Mark as Paid manually", "View History"

* Row click: expands inline to show payment timestamps and transaction IDs

**Footer Summary Bar:**

* Total: X students | Paid: Y | Unpaid: Z | Partial: W

* Total collected: ₦X of ₦Y (progress bar inline)

### **4.1.6  Payroll Page**

Configure and monitor staff salary disbursements.

**Payroll Config Panel:**

* Payroll Day: number input (e.g., "20") \+ month selector

* Total Payroll: auto-calculated from staff list

* Status: "Scheduled for 20 June 2026" or "Not configured"

* "Update Schedule" button

**Staff List Table:**

* Columns: \# | Staff Name | Role | Bank | Account Number | Monthly Salary | Status

* "Add Staff" button opens modal: name, role, bank (dropdown from NIBSS list), account no., salary

* "Edit" and "Remove" icons per row

**Payroll History Accordion:**

* Each past payroll entry expandable: date, total, number of staff, Squad Batch Transfer ID

* Per-staff transfer reference visible on expansion

* Status: Completed | Failed | Partial

### **4.1.7  Forecast Page**

Cash flow projection for the next 90 days.

**Forecast Chart (main, full-width):**

* Recharts LineChart with 3 series:

*   \- Projected Balance (blue solid line)

*   \- Upper Confidence Bound (blue dashed line)

*   \- Lower Confidence Bound (blue dashed line)

* Shaded band between confidence bounds

* Red horizontal dashed line at "Payroll Threshold" (total payroll amount)

* X-axis: dates (today → \+90 days)

* Y-axis: ₦ amounts

* Tooltip on hover: date, projected balance, bounds

**Summary Cards below chart:**

* 30-day projection | 60-day projection | 90-day projection

* Each card shows projected balance \+ "Sufficient for payroll? ✓ or ✗"

**Assumptions Panel (expandable):**

* Collection rate used: X% per day

* Payroll obligation: ₦X on the 20th

* Based on: last 30 days of payment data

* "Update Assumptions" — allows manual override

### **4.1.8  Audit Log Page**

**Full-width table:**

* Columns: Timestamp | Event Type | Description | Amount | Squad Transaction ID | Status

* Event types: PAYMENT\_RECEIVED | PAYROLL\_EXECUTED | LINK\_GENERATED | ONBOARDED | WEBHOOK\_RECEIVED

* Filter by date range and event type

* "Export CSV" button

## **4.2  WHATSAPP CHANNEL**

* Used exclusively as a notification push channel — NOT as an operational dashboard

* All messages are utility tier ($0.012/msg) — no marketing broadcasts

**Message templates:**

* PAYMENT\_RECEIVED: "SquadBridge: ₦\[amount\] received from \[student name\]. Total collected: ₦\[total\]. View: app.squadbridge.com"

* PAYROLL\_COMPLETE: "SquadBridge: Payroll executed. \[N\] staff paid ₦\[total\]. Balance: ₦\[balance\]. Ref: \[batch\_id\]"

* BALANCE\_UPDATE: "SquadBridge: Your Squad balance is now ₦\[balance\]."

* FORECAST\_ALERT: "SquadBridge Alert: At current pace, balance on 20 Jun will be ₦\[amount\] — below payroll of ₦\[payroll\]. Review: app.squadbridge.com/forecast"

* ONBOARDING\_WELCOME: "Welcome to SquadBridge\! Your account number: \[NUBAN\]. Log in: app.squadbridge.com"

## **4.3  USSD CHANNEL (AFRICA'S TALKING — FREE TIER)**

* Dial: \*556\# from any Nigerian GSM network

* Provider: Africa's Talking free tier (1,000 sessions/month — sufficient for MVP)

* Express.js handler: POST /ussd/callback

**Complete USSD Menu Structure:**

Main Menu (CON):

  Welcome to SquadBridge

  1\. Check Balance

  2\. Collections Summary

  3\. Request Payout

  4\. Help

  0\. Exit

Option 1 → Balance (END):

  Your Squad Balance: N4,700,000

  As of: 13 May 2026, 10:32am

Option 2 → Collections (END):

  Students Paid: 72 / 150

  Amount: N4.68M of N9.75M

  48% collected this term

Option 3 → Payout (CON):

  Available: N4,700,000

  Enter amount to transfer:

  \[user enters amount\]

  → Confirm transfer of N\[amount\]? 1.Yes 2.No

  → Transfer queued. Ref: SB-\[id\]

## **4.4  SPITCH VOICE SERVICES**

* Provider: Spitch TTS/STT API

* Languages: en-NG (English), yo-NG (Yoruba), ha-NG (Hausa), pcm-NG (Nigerian Pidgin)

**TTS Use Cases:**

* Payroll confirmation: "Payroll complete. Twenty staff paid three-point-eight million naira. Your balance is four-point-seven million."

* Balance announcement: "Your Squad balance is four million, seven hundred thousand naira as of today."

* Forecast alert: "Warning: Your projected balance in thirty days is two-point-one million, which is below your payroll of three-point-eight million."

**STT Use Case (Phase 2):**

* Receive WhatsApp voice notes from traders/bursars

* Transcribe via Spitch STT, classify intent via NLP, route to appropriate handler

**Audio file storage:**

* Generated MP3 stored in Azure Blob Storage

* URL returned to Express.js, stored in Azure SQL with expiry

* Dashboard displays playback button alongside payroll records

# **5\.  TECHNICAL ARCHITECTURE**

## **5.1  SYSTEM ARCHITECTURE OVERVIEW**

SquadBridge is a three-tier web application: a React/Next.js client, a Node.js/Express.js API server, and Azure cloud data services. External integrations sit alongside the API tier.

**Request flow:**

25. User opens app.squadbridge.com → Next.js serves React client

26. React client makes authenticated API calls to Express.js API (same Azure App Service, /api/\* routes)

27. Express.js queries Azure SQL via Sequelize, reads/writes Redis via ioredis

28. Express.js calls Squad APIs, Spitch, Africa's Talking, Meta WhatsApp

29. Squad fires webhooks → Express.js POST /webhooks/squad/payment → Redis dedup → SQL update → Socket.io emit

30. Azure Functions (Node.js 20\) run scheduled jobs (payroll, forecasting) independently

## **5.2  EXPRESS.JS BACKEND ARCHITECTURE**

**Folder structure:**

/src

  /routes

    schools.js          — POST /api/v1/schools/onboard, GET /api/v1/schools/:id

    paymentLinks.js     — POST /api/v1/schools/:id/payment-links

    payroll.js          — POST /api/v1/schools/:id/payroll/configure

    forecast.js         — GET  /api/v1/schools/:id/forecast

    webhooks.js         — POST /webhooks/squad/payment

    ussd.js             — POST /ussd/callback

    voice.js            — POST /api/v1/voice/tts

    auth.js             — POST /api/v1/auth/login

  /middleware

    auth.js             — JWT validation middleware

    validateSquadSig.js — HMAC-SHA256 Squad webhook verifier

    rateLimiter.js      — express-rate-limit per IP

    errorHandler.js     — global error handler

  /services

    squadService.js     — Squad API client (axios wrapper)

    spitchService.js    — Spitch TTS/STT client

    whatsappService.js  — Meta WhatsApp Business API client

    atService.js        — Africa's Talking USSD/SMS client

    forecastService.js  — Exponential smoothing calculator

  /models

    School.js           — Sequelize model

    Student.js          — Sequelize model

    Transaction.js      — Sequelize model

    PayrollConfig.js    — Sequelize model

    PayrollLog.js       — Sequelize model

  /azure-functions

    payrollTrigger.js   — Timer trigger: run payroll on scheduled day

    forecastTrigger.js  — Timer trigger: nightly forecast update

**Key Express.js middleware stack (app.js):**

31. helmet() — security headers

32. cors({ origin: process.env.FRONTEND\_URL }) — CORS

33. express.json({ limit: "1mb" }) — body parser

34. morgan("combined") — HTTP request logging

35. rateLimiter — 100 req/15min per IP

36. authMiddleware — JWT validation on /api/\* routes

37. Routes mounted

38. errorHandler — global catch

## **5.3  DATABASE SCHEMA (AZURE SQL — SEQUELIZE)**

| Table | Primary Key | Foreign Keys | Key Columns |
| :---- | :---- | :---- | :---- |
| Schools | id (UUID) | — | name, nuban, squad\_merchant\_id, student\_count, fee\_per\_term, staff\_count, avg\_salary, phone, bvn\_verified |
| Students | id (UUID) | school\_id | name, class, fee\_amount, fee\_status, payment\_link\_id, squad\_link\_url |
| Transactions | id (UUID) | school\_id, student\_id | squad\_transaction\_id, amount, status, payment\_method, timestamp, webhook\_received\_at |
| PayrollConfigs | id (UUID) | school\_id | payroll\_day, total\_amount, status (active/paused) |
| PayrollStaff | id (UUID) | school\_id | name, role, bank\_code, account\_number, amount |
| PayrollLogs | id (UUID) | school\_id, config\_id | executed\_at, total\_amount, squad\_batch\_id, status, staff\_count |
| Forecasts | id (UUID) | school\_id | generated\_at, day30, day60, day90, upper30, lower30, model\_params |

## **5.4  AZURE INFRASTRUCTURE DETAIL**

| Azure Service | Configuration | Cost Tier |
| :---- | :---- | :---- |
| App Service | B2 Standard, Linux, Node.js 20 container. Auto-scale 2–5 instances on CPU \> 70%. | \~$60/month |
| SQL Database | Standard S2 (50 DTUs). TDE on. Geo-redundant backup. Point-in-time restore 7 days. | \~$75/month |
| Redis Cache | C1 Standard 1GB. Persistence on. Two replicas for HA. | \~$55/month |
| Functions | Consumption plan, Node.js 20\. Timer triggers for payroll (daily) and forecast (nightly). | Free tier |
| Blob Storage | Standard LRS. Containers: audio (Spitch output), documents, logs. | \~$5/month |
| Key Vault | Stores: Squad API keys, Meta token, Spitch key, AT key, JWT secret, DB connection string. | \~$5/month |
| App Insights | Full telemetry. Custom dashboards for webhook latency, payroll success rate, active users. | \~$10/month |
| Container Registry | Basic tier. Stores Docker images for Express.js \+ Next.js. | \~$5/month |

**CI/CD Pipeline (GitHub Actions):**

39. Push to main branch triggers workflow

40. Run unit tests (Jest for Express.js, Vitest for React)

41. Build Docker images for backend and frontend

42. Push to Azure Container Registry

43. Deploy to Azure App Service via az webapp deploy

44. Run smoke tests against staging slot

45. Swap staging slot to production on success

## **5.5  KEY API ENDPOINTS REFERENCE (EXPRESS.JS)**

| Endpoint | Method | Description |
| :---- | :---- | :---- |
| /api/v1/schools/onboard | POST | Create school, call Squad Virtual Account \+ KYC |
| /api/v1/schools/:id | GET | Fetch school profile, balance, metrics |
| /api/v1/schools/:id/pl | GET | Return P\&L calculation for school |
| /api/v1/schools/:id/payment-links | POST | Batch generate Squad Payment Links for students |
| /api/v1/schools/:id/dashboard | GET | Aggregate dashboard data (balance, collections, forecast) |
| /api/v1/schools/:id/payroll/configure | POST | Save payroll schedule and staff list |
| /api/v1/schools/:id/payroll/execute | POST | Manually trigger payroll (also auto via Azure Function) |
| /api/v1/schools/:id/forecast | GET | Return latest 30/60/90-day cash flow forecast |
| /webhooks/squad/payment | POST | Receive Squad payment webhook, update collections |
| /ussd/callback | POST | Receive Africa's Talking USSD request, return menu |
| /api/v1/voice/tts | POST | Generate Spitch TTS audio, save to Azure Blob |
| /api/v1/auth/login | POST | Authenticate bursar, return JWT |

# **6\.  NON-FUNCTIONAL REQUIREMENTS**

## **6.1  PERFORMANCE REQUIREMENTS**

| Metric | Target | Priority |
| :---- | :---- | :---- |
| Web dashboard initial load | \< 2 seconds (LCP) | MUST |
| Express.js API response (p95) | \< 500ms | MUST |
| Webhook → dashboard update latency | \< 1 second via Socket.io | MUST |
| Payment link batch (150 students) | \< 60 seconds | MUST |
| USSD response | \< 10 seconds | MUST |
| Spitch TTS generation | \< 3 seconds | SHOULD |
| Concurrent users | 1,000+ simultaneous dashboard sessions | SHOULD |
| Payroll execution (20 staff) | \< 30 seconds via Squad Bulk Transfer | MUST |

## **6.2  SAFETY REQUIREMENTS**

* Input validation on all request bodies (express-validator middleware)

* Webhook idempotency: Redis dedup key (TTL 24hr) prevents double-counting

* Payroll guard: balance check before calling Squad Bulk Transfer — halt \+ alert if insufficient

* SQL injection protection: Sequelize parameterized queries (never raw string interpolation)

* Rate limiting: 100 requests/15 minutes per IP on all API endpoints

* Graceful error handling: all Squad API failures surface human-readable alerts on dashboard

## **6.3  SECURITY REQUIREMENTS**

* Authentication: JWT tokens (RS256) issued on login, verified by authMiddleware on every /api/\* request

* Azure AD for dashboard SSO (via NextAuth.js \+ Azure AD provider)

* NDPA 2023: Azure South Africa North or UK South — no cross-border transfer

* Encryption in transit: TLS 1.2+ enforced at Azure Front Door level

* Encryption at rest: Azure SQL TDE on, Blob Storage server-side encryption

* BVN Privacy: Raw BVN never stored. Only Squad-validated merchant\_id retained

* All secrets in Azure Key Vault — Express.js reads via @azure/keyvault-secrets SDK

* Webhook verification: HMAC-SHA256 signature validated before any Squad webhook processing

* CORS: Only app.squadbridge.com origin accepted on API routes

* Helmet.js: sets X-Frame-Options, CSP, HSTS, X-XSS-Protection headers

## **6.4  SOFTWARE QUALITY ATTRIBUTES**

| Attribute | Specification |
| :---- | :---- |
| Availability | 99.5% uptime SLA. Azure App Service auto-restart. Multi-instance deployment prevents single points of failure. |
| Scalability | MVP: 10K schools, 100K+ users. Azure App Service horizontal scale (2–5 instances). Azure SQL scale-up for read-heavy load. |
| Reliability | Azure SQL daily backups, 7-day point-in-time restore. RTO: 2 hours. RPO: 15 minutes. Squad webhook retry logic: 3 retries with exponential backoff. |
| Maintainability | GitHub Actions CI/CD. Jest unit test coverage \> 80%. Supertest integration tests for all Express.js routes. Auto-rollback on failed health checks. |
| Usability | WCAG 2.1 AA. Multi-language UI (English, Pidgin, Yoruba, Hausa). USSD fallback requires zero data connection. |
| Observability | Azure Application Insights for all telemetry. Custom metrics: webhook\_latency\_ms, payroll\_success\_rate, active\_sessions. Slack alert on critical failure. |

# **APPENDIX A: SQUAD API MASTER REFERENCE**

| Squad API / Endpoint | SquadBridge Use Case | Flow(s) |
| :---- | :---- | :---- |
| POST /virtual-account | Provision unique NUBAN for every user at onboarding | 1, 2, 3 |
| Aggregator / Sub-merchant API | BVN-linked KYC and compliant financial identity creation | 1, 2, 3 |
| Transfer API (single) | Gig earnings to graduates; escrow release to artisans on completion | 1, 2 |
| Transfer API (bulk) | Automated monthly payroll disbursement to all staff | 3 |
| Payment Gateway | Card, bank transfer, USSD collections from parents and customers | 2, 3 |
| Payment Links API | Per-student/per-patient fee invoices; shareable trader invoices | 2, 3 |
| Direct Debit API | Recurring monthly authorisations for creches and clinics | 3 |
| Webhooks | Real-time event capture; primary ML credit engine input | 1, 2, 3 |
| Dynamic Virtual Account | Transaction-specific escrow for artisan-client agreements | 2 |
| /payout/list endpoint | Aggregated payout history for ML feature extraction | 1, 2 |

# **APPENDIX B: BUSINESS MODEL**

| Revenue Stream | Detail |
| :---- | :---- |
| Transaction commission | 2–3% of escrow value at disbursement (artisan/gig flows). Not visible to payer — does not disrupt negotiation psychology. |
| Institutional SaaS fee | ₦5,000–₦15,000/month depending on student/patient volume. Justified by payroll automation savings. |
| Credit origination fee | 1–2% of loan value charged to lending partner (LAPO, AB MFB, FairMoney). SquadBridge bears zero credit risk. |
| WhatsApp pass-through | Utility messages (\~$0.012/msg) embedded in SaaS fee. No per-message charge to institution. |

END OF SRS DOCUMENT**END OF SRS DOCUMENT**

*SquadBridge × Squad: Making every transaction count — for the person who made it.*