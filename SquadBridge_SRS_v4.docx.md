

**SQUADBRIDGE**

*Software Requirements Specification*

Nigeria's Conversational Economic Operating System

Version 4.0  ·  May 2026  ·  Squad Hackathon 3.0

| Layer | Technology / Service |
| :---- | :---- |
| Frontend | React 18 \+ Next.js 14 (App Router) — deployed on Vercel |
| Backend | Node.js 20 \+ Express.js 4.x — Azure App Service |
| Database | Azure SQL Server (Sequelize ORM) \+ Azure Redis Cache |
| Website Voice Agent | Vapi — real-time browser voice call (chat widget) |
| Offline Phone Agent | Twilio / Vapi SIP — callable phone number, no internet required |
| AI Conversation Engine | Azure OpenAI GPT-4o (128k context, function calling) |
| WhatsApp Voice Notes | Azure Cognitive Services — STT (voice→text) \+ TTS (text→audio) |
| Credit Scoring ML | XGBoost — Azure ML Managed Online Endpoint |
| Payments | Squad by HabariPay — all financial flows |
| Scheduling | Azure Functions v4 (Node.js 20\) — payroll \+ forecasting \+ opportunity scraping |
| WhatsApp | Meta Business API — utility tier only |
| USSD | Africa's Talking — \*556\# free tier |
| Opportunity Scraping | Azure Function \+ Playwright/Cheerio — Discovery Africa, Sisterly HQ, Jobberman etc. |

# **1\. Introduction**

## **1.1 Purpose**

This SRS is the definitive technical and functional specification for SquadBridge Version 4.0. It incorporates all changes made since SRS v3, including the addition of a fourth user type (Employers/Clients), two additional languages (French and Swahili), a fully redesigned four-channel access architecture, a new offline AI phone agent, a seamless voice-first onboarding redesign, trader verification badges, an employer dashboard with anonymized talent pool, external opportunity sourcing, and a complete Squad API strategic mapping. It also includes all system workflows.

## **1.2 The Problem**

Nigeria's informal economy is 65% of GDP, employs 85% of the labour force, yet is structurally invisible to formal finance. Three groups are hardest hit:

* **Traders:** 39 million traders with no transaction history, no credit score, no access to working capital.

* **Graduates:** 1.7 million graduates entering the workforce annually with no verifiable income and no path to formal employment.

* **Institutions:** 140,000+ schools, clinics, pharmacies, workshops and cooperatives managing finances on paper with chronic cash flow crises.

| Core Thesis: Formalization does not require a bank branch or government document. It requires a Squad Virtual Account, a conversational AI agent accessible from any device, and a machine learning engine that turns behavioral transaction data into credit access. |
| :---- |

## **1.3 Document Conventions**

| Term | Meaning |
| :---- | :---- |
| MUST | Mandatory — system incomplete without it |
| SHOULD | Highly desirable — implement if feasible in MVP scope |
| MAY | Post-MVP / Phase 2–3 |
| Agent | SquadBridge AI conversational agent (Azure OpenAI GPT-4o) |
| Vapi | Voice AI platform — powers real-time browser voice calls and offline phone agent |
| STT | Speech-to-Text — Azure Cognitive Services (WhatsApp voice notes → text) |
| TTS | Text-to-Speech — Azure Cognitive Services (text → WhatsApp audio reply) |
| NUBAN | 10-digit Nigerian bank account number — provisioned via Squad Virtual Account API |
| DTMF | Dual-Tone Multi-Frequency — keypad tones used for BVN entry on offline phone calls |
| BVN | Bank Verification Number — Nigeria's biometric financial identity (11 digits) |
| NDPA | Nigeria Data Protection Act 2023 |
| Dynamic VA | Squad Dynamic Virtual Account v2 — per-transaction escrow account |

# **2\. User Types**

SquadBridge serves four distinct user types. Each has a tailored experience across the four access channels.

| User Type | Who They Are | Primary Goal | Primary Channel |
| :---- | :---- | :---- | :---- |
| Graduates / Job Seekers | Fresh graduates, young Nigerians seeking gigs, internships, training, income | Find work, earn income, build credit history | Website voice call → WhatsApp |
| Traders / Artisans | Market vendors, tailors, plumbers, electricians, carpenters, welders — skilled informal workers | Receive payments, hire graduates, access working capital loans | Website voice call / Offline phone → WhatsApp |
| Legacy Businesses | Schools, clinics, pharmacies, salons, workshops, cooperatives, crèches, transport unions | Automate fee collection, run payroll, manage cash flow | Website voice call → Web dashboard \+ WhatsApp alerts |
| Employers / Clients | Individuals and companies who need to hire traders for skilled jobs or graduates for gigs | Post jobs, find verified workers, pay safely via escrow | Website voice call → Web dashboard \+ WhatsApp |

# **3\. Languages**

SquadBridge operates in seven languages across all four channels. Language is auto-detected from the first message or voice utterance and remembered permanently for that user.

| Language | Code | Coverage | Channel Support |
| :---- | :---- | :---- | :---- |
| English | en | Nigeria, pan-African formal | All channels |
| Nigerian Pidgin | pcm-NG | Nigeria-wide informal | All channels |
| Yoruba | yo-NG | Southwest Nigeria, Benin Republic | All channels |
| Hausa | ha-NG | North Nigeria, Niger, Ghana | All channels |
| Igbo | ig-NG | Southeast Nigeria | All channels |
| French | fr | West & Central Africa (17 countries) | Website agent, WhatsApp, Offline phone |
| Swahili | sw | East Africa — Kenya, Tanzania, Uganda | Website agent, WhatsApp, Offline phone |

**→** *Azure Cognitive Services supports all 7 languages for STT and TTS. Azure OpenAI GPT-4o handles all 7 natively. Vapi supports multilingual voice with automatic language switching mid-call.*

# **4\. Four-Channel Architecture**

SquadBridge reaches users across four distinct surfaces. No user is excluded — whether they have a laptop, a smartphone, or a basic feature phone with no internet.

| Channel | Device Required | Internet Required | Primary Use Case | Who It Serves |
| :---- | :---- | :---- | :---- | :---- |
| Website Voice Call (Vapi) | Smartphone or computer | Yes | Primary onboarding — real-time AI voice call in browser. Click one button, agent speaks instantly. | Graduates, traders, employers, schools with internet access |
| WhatsApp | Smartphone | Yes | Ongoing engagement — daily opportunities, payments, escrow, credit updates, gig matching, conversational agent | All user types post-onboarding |
| Offline Phone Agent (Twilio/Vapi SIP) | Any phone including feature phones | No — standard call | Full onboarding and ongoing support over a real phone call. AI agent answers. No internet on caller's side. | Rural traders, artisans with no smartphone or internet |
| USSD \*556\# | Any GSM phone | No | Quick operational checks — balance, collections, payout requests. 10-second responses. | All users — especially feature phone users for daily checks |

## **4.1 Website Voice Call (Vapi) — Detail**

A pop-up chat widget sits in the bottom-right corner of app.squadbridge.com. After 5 seconds a prompt appears: 'Talk to SquadBridge — get set up in 2 minutes.' The user clicks the widget to expand it. Inside they see a text chat area and a prominent phone call button. Clicking the call button initiates a live Vapi voice call directly in the browser — no phone number needed, no app download. The AI agent speaks immediately.

## **4.2 Offline Phone Agent (Twilio / Vapi SIP) — Detail**

A real Nigerian phone number provisioned via Twilio or Vapi SIP. Anyone dials it from any phone. The AI agent answers and conducts full conversations — onboarding, balance checks, job posting, payment confirmation, loan eligibility — entirely by voice. BVN is collected via DTMF keypad tones (user presses digits, never speaks them aloud). Squad Virtual Account is provisioned before the call ends. The number is printed on flyers, shared via SMS, and broadcast on community radio. This is how SquadBridge reaches users who have never touched the internet.

## **4.3 USSD \*556\# — Menu Structure**

Powered by Africa's Talking free tier. User dials \*556\# from any Nigerian GSM network. All responses within 10 seconds. USSD is for existing users only — not for onboarding.

| Option | Menu Item | Response |
| :---- | :---- | :---- |
| 1 | Check Balance | Your Squad Balance: ₦\[amount\] as of \[date, time\] |
| 2 | Collections Summary (Schools) | Students Paid: X of Y | Amount: ₦X of ₦Y | Z% collected this term |
| 3 | Recent Payments | Last 3 transactions: payer name, amount, date/time |
| 4 | Request Payout | Enter amount → Confirm → Transfer queued → SMS confirmation with reference |
| 5 | My Credit Score | Score: \[X/850\] | Status: \[Good/Fair/Building\] | Loan eligibility: ₦\[amount\] |
| 0 | Exit | Session closed |

**→** *Post-MVP: 4-digit PIN added for payout security on USSD Option 4\.*

# **5\. Onboarding — Voice-First, Seamless**

| Design Principle: The AI voice agent does all the work. The user just talks. The only keyboard input in the entire onboarding process is 11 digits (BVN) entered into a single secure field. Total time: under 2 minutes. No forms. No email verification. No password creation. No document uploads. |
| :---- |

## **5.1 Website Onboarding Flow (Vapi)**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **User** | Lands on app.squadbridge.com. After 5 seconds the chat widget prompts: 'Talk to SquadBridge — set up in 2 minutes.' User clicks the widget. |  |
| **2** | **User** | Clicks the 📞 Call button inside the expanded widget. | *Vapi — initiates browser voice call* |
| **3** | **Agent** | Speaks immediately: 'Hey\! Welcome to SquadBridge. I'm your agent. Quick question — are you looking for work, running a business, managing a school or clinic, or looking to hire someone?' | *Azure OpenAI GPT-4o* |
| **4** | **User** | Responds by voice (or text in the chat window). Agent detects language automatically. | *Azure Language Detection* |
| **5** | **Agent** | Asks 2–3 targeted questions based on user type (see Section 5.3). Collects name, phone number, and key profile details conversationally. | *GPT-4o function calling* |
| **6** | **Agent** | 'Last step — I need to verify your identity. I'm showing you a secure field right now. Type your BVN there — 11 digits, takes 5 seconds.' Secure input appears in the widget. |  |
| **7** | **User** | Types BVN into the secure field. This is the only keyboard interaction in onboarding. |  |
| **8** | **System** | Calls Squad Aggregator/Sub-merchant API with BVN for instant identity verification. | *Squad Aggregator API* |
| **9** | **System** | Immediately calls Squad POST /virtual-account. NUBAN provisioned in under 5 seconds. | *Squad POST /virtual-account* |
| **10** | **Agent** | 'You're all set\! Your SquadBridge account number is \[NUBAN\]. I'm sending your first message on WhatsApp right now.' Call ends. | *Meta Business API* |
| **11** | **System** | WhatsApp welcome message sent to user's phone. User profile exists in DB. They are fully onboarded. | *Meta Business API* |

## **5.2 Offline Phone Onboarding Flow**

For users with no internet. They call the SquadBridge phone number from any phone.

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **User** | Dials the SquadBridge phone number from any phone. Feature phone, smartphone, landline — all work. | *Twilio / Vapi SIP* |
| **2** | **Agent** | Answers immediately. Speaks in detected language: 'Welcome to SquadBridge. Are you looking for work, running a business, managing a school, or looking to hire someone?' | *GPT-4o \+ Azure TTS* |
| **3** | **User** | Responds by voice. Agent collects name, phone, user type, and 2–3 profile questions. | *Azure STT → GPT-4o* |
| **4** | **Agent** | 'I need to verify your identity. Please press your BVN digits on your keypad now. Nobody can hear them.' Waits for DTMF input. | *Twilio DTMF capture* |
| **5** | **User** | Presses 11 BVN digits on keypad. Agent reads back: '11 digits received. Is that correct?' User confirms with 1 (Yes) or 2 (No). |  |
| **6** | **System** | BVN sent to Squad Aggregator API for verification. Squad Virtual Account provisioned. | *Squad Aggregator \+ /virtual-account* |
| **7** | **Agent** | 'Your account number is \[NUBAN\]. Save this number — it is your payment account. Do you have WhatsApp? If yes, I'll send updates there. If not, you can call this number anytime or dial \*556\#.' Call ends. | *Meta Business API / SMS* |

## **5.3 Questions Asked Per User Type (Voice Agent)**

| User Type | Question 1 | Question 2 | Question 3 |
| :---- | :---- | :---- | :---- |
| Graduate | What skills do you have? (data entry, Excel, customer service, coding, design — anything) | Where are you based? (city or area) | — |
| Trader / Artisan | What do you do or sell? | What market or area are you in? | — |
| Legacy Business | What is the name of your institution and what type is it? (school, clinic, pharmacy, workshop, cooperative) | How many students or patients do you have? | What is your fee per term or per visit? |
| Employer / Client | What kind of work do you need done? | Where are you based? | — |

**→** *BVN provides name and date of birth automatically via Squad KYC — agent never asks for these separately.*

# **6\. Employer / Client Dashboard**

## **6.1 Overview**

Employers log in after onboarding and access a dashboard that shows them an anonymized talent pool of graduates and traders. Personal information (name, phone, account number) is never visible until the employer has formally requested to hire and the worker has accepted. SquadBridge mediates all connections.

## **6.2 Dashboard Screens**

| Screen | Content & Functionality |
| :---- | :---- |
| Talent Pool | Grid of anonymized candidate cards. Each card shows: skill tags, general area (not specific address), experience level, years active on platform, gig completion rate, reliability score (derived from Squad transaction history), and verification badge tier. Employer cannot see name, phone, or NUBAN. Filter by: skill, location, badge tier, availability. |
| Post a Job | Form or voice-input (via embedded agent): job title, skills required, location, duration, budget. Agent auto-generates the full job description from a 30-second voice note. Job posted to internal marketplace \+ relevant graduates/traders notified on WhatsApp. |
| My Hires | Active jobs with status: Escrow Funded / Work In Progress / Awaiting Confirmation / Completed / Disputed. 'Confirm Completion' button releases escrow. Payment trail visible. |
| AI Hiring Assistant | Chat widget powered by GPT-4o. Employer can ask: 'Who is best for my Excel data entry job in Lagos?' Agent returns anonymized recommendations with skill match %, completion rate, and reliability signals. Cannot reveal personal info. |
| Payment & Escrow | All transactions via Squad escrow. Employer sees: amount locked, job reference, escrow account number, release status. |
| Reputation Score | Employer's own platform rating — affects visibility of their job posts. Employers with dispute history or non-payment patterns are flagged and talent pool access is restricted. |

## **6.3 Hire Request Flow**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Employer** | Browses anonymized talent pool. Selects a candidate card. Clicks 'Request to Hire'. |  |
| **2** | **System** | Sends WhatsApp notification to the graduate or trader: 'An employer wants to hire you for \[job description\]. Accept or Decline?' | *Meta Business API* |
| **3** | **Worker** | Replies Accept or Decline on WhatsApp. |  |
| **4** | **System (Accept)** | Squad Dynamic Virtual Account created for this specific job. Employer notified with escrow account number and amount to deposit. | *Squad Dynamic VA* |
| **5** | **Employer** | Transfers agreed amount to the Dynamic VA. Squad holds funds in escrow. | *Squad Payment Gateway* |
| **6** | **System** | Squad webhook fires confirming escrow funded. Both parties notified on WhatsApp. Worker's contact details now shared with employer. Work begins. | *Squad Webhooks* |
| **7** | **Employer** | Confirms job completion via dashboard or WhatsApp. |  |
| **8** | **System** | Squad Transfer API releases funds to worker's Squad Virtual Account minus 2–3% platform fee. | *Squad Transfer API* |
| **9** | **System** | Webhook fires. Both parties notified. Transaction recorded. Worker's credit profile updated. | *Squad Webhooks* |

# **7\. Trader Verification — Tiered Badge System**

Trust is the foundation of the SquadBridge marketplace. Traders and artisans are verified progressively through five tiers. Each tier adds a visible badge to their employer-facing profile card. Employers can filter the talent pool by badge tier.

| Tier | Badge Name | How It Is Earned | Display |
| :---- | :---- | :---- | :---- |
| 1 | Registered ✓ | BVN verified via Squad Aggregator API. Squad Virtual Account active. Identity confirmed. | Grey badge — identity confirmed |
| 2 | Trusted ⭐ | 3 or more completed escrow transactions on-platform with zero disputes. Verified through Squad webhook history. | Blue badge — platform-proven |
| 3 | Verified 🛡 | Uploads a trade certificate, apprenticeship letter, NABTEB cert, guild membership, or professional license. GPT-4o reviews the document image for authenticity signals and classification. | Green badge — document-verified |
| 4 | Expert 🔧 | Completes an AI-generated skill assessment tailored to their specific trade. GPT-4o generates 10 trade-specific practical questions. A plumber gets different questions from a digital marketer. Portfolio submission (photos of work) also accepted for craft trades. | Gold badge — skill-tested |
| 5 | Elite 🏆 | 90+ days active on platform, 20+ completed jobs, 4.5 or higher average client rating, zero unresolved disputes, consistent Squad transaction history showing business growth. | Platinum badge — platform elite |

| AI Skill Test Design: When a trader reaches Tier 4, GPT-4o generates a unique 10-question assessment for their declared trade. Questions are practical scenarios — not trivia. A carpenter is shown a furniture brief and asked about wood selection, joinery, and finishing. A social media manager is given a client brief and asked about content strategy. A tailor is asked about fabric types, measurements, and pattern reading. Responses are scored by GPT-4o against a trade-specific rubric. |
| :---- |

# **8\. Opportunity Engine**

## **8.1 External Opportunity Sourcing**

An Azure Function runs every day at 6:00 AM WAT. It searches and scrapes curated African opportunity platforms for internships, jobs, training programs, fellowships, and government schemes.

| Source | Type of Opportunities |
| :---- | :---- |
| Discovery Africa | Graduate programs, fellowships, opportunities across Africa |
| Sisterly HQ | Opportunities focused on women in Africa — jobs, grants, training |
| Jobberman Nigeria | Formal and semi-formal jobs, internships |
| MyJobMag | Diverse Nigerian job listings — entry level to mid level |
| NGCareers | NGO and development sector opportunities |
| 3MTT (Federal Government) | 3 Million Technical Talents — stipend ₦75,000/month training cohorts |
| LearnToEarn | Government-backed stipend training programs |
| AltSchool Africa | Tech and business training cohorts |
| ALX Africa | Leadership, tech, and entrepreneurship programs |
| Google Africa | Developer scholarships, digital skills programs |

## **8.2 Opportunity Processing**

* Azure Function scrapes sources using Playwright and Cheerio, extracting: title, description, organization, location, deadline, link, type

* GPT-4o tags each opportunity with: skill requirements, target user type (Graduate/Trader/All), location relevance, opportunity type (gig/training/internship/full-time/fellowship/government)

* Tagged opportunities stored in OpportunityPool table in Azure SQL

* Duplicate detection via URL hash — same opportunity never sent twice to the same user

## **8.3 Daily WhatsApp Digest**

Every morning at 8:00 AM WAT, the system sends each active graduate and eligible trader a personalized WhatsApp message with 3–5 curated opportunities matching their skill profile and location. The message includes: opportunity title, organization, pay or stipend (if available), deadline, and a direct link.

| Example WhatsApp Digest: Good morning Chidi\! Here are today's opportunities for you:1. Data Analyst Intern — TechCorp Lagos (₦80,000/month) — Deadline: 20 May. Apply: \[link\]2. ALX Data Science Program — Free, 6 months, remote — Deadline: 25 May. Apply: \[link\]3. Gig: Excel Reports for Apex Logistics, VI — ₦5,500/day, 3 days. Posted by Trader on SquadBridge. Reply 'Take 3' to apply. |
| :---- |

## **8.4 Skill Gap Detection & Training Recommendation**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Graduate** | Applies for a gig or opportunity that requires skills they do not have. |  |
| **2** | **System** | GPT-4o compares graduate skill tags against opportunity requirements. Confidence score \< 60% \= skill gap detected. | *GPT-4o* |
| **3** | **Agent** | Sends WhatsApp message: 'You're close for this role but missing SQL. I found a free 5-day course from ALX that covers exactly what you need. Want the link?' | *Meta Business API* |
| **4** | **Graduate** | Completes the course. Partner API confirms completion OR graduate uploads certificate. |  |
| **5** | **System** | New skill tag added to graduate profile with 'verified' flag. Gig matching re-runs automatically. |  |
| **6** | **Agent** | 'You've unlocked 12 new opportunities with your new SQL badge. Here are the top 3 matches today.' | *Meta Business API* |

# **9\. Squad API — Strategic Mapping**

Every financial event on SquadBridge routes through Squad. Different Squad APIs are used for different transaction types based on the nature of the payment.

| Squad API | Type | Where Used | Why This API |
| :---- | :---- | :---- | :---- |
| POST /virtual-account | Static — permanent | Every user at signup (graduate, trader, employer) | Permanent wallet tied to their identity. All inbound payments (gig earnings, stipends, customer payments) land here for the lifetime of the account. |
| POST /virtual-account (business) | Static — permanent | Schools, clinics, registered trader businesses | Carries the business name so 'Sunrise Academy — SquadBridge' appears on the parent's transfer receipt. Builds institutional trust. |
| Dynamic Virtual Account v2 | Dynamic — per transaction | Every escrow transaction between employer and trader/graduate | Created for one specific job agreement. Time-limited. Client pays into this unique account. Squad holds funds. Released only on job completion confirmation. Destroyed after use. Prevents platform leakage. |
| Payment Links API | Per invoice | Schools (per student), traders (per invoice), employers (per job deposit) | Each link is unique, trackable, and tied to a specific record. Shareable via WhatsApp, SMS, email. When paid, webhook identifies exactly which student/invoice was settled. |
| Payment Gateway | Collection | Customer payments, school fee payments, employer job deposits | Card (Visa/Mastercard/Verve), bank transfer, USSD, QR code. Parents, customers, and employers pay via Squad's hosted payment page — no card details enter our system. |
| Transfer API — Single | Payout | Gig payment to graduate, escrow release to trader, stipend disbursement | Individual payout from our platform ledger to a user's Squad Virtual Account. Used whenever one specific person needs to be paid. |
| Transfer API — Bulk | Payroll | School and clinic monthly payroll — all staff paid at once | One API call pays all staff simultaneously on the scheduled payroll date. Azure Function triggers this automatically. |
| Direct Debit API | Recurring | Crèches, monthly clinics, cooperative membership fees | Parent or patient authorises once. Fees deducted automatically each month. No manual payment needed. |
| Webhooks | Real-time events | All flows — every financial event | Squad posts to our /webhooks/squad/payment endpoint on every transaction. This feeds: dashboard live updates (Socket.io), WhatsApp notifications, credit scoring model (XGBoost features), audit log, opportunity unlock triggers. |
| Account Lookup API | Verification | Before every payroll transfer | Verifies staff bank account name and number before money is sent. Prevents payroll errors. |
| /payout/list | History | Credit scoring feature extraction | Fetches full payout history for a user. Used by the XGBoost model to build the transaction frequency and trajectory features. |

# **10\. The AI Agent — Full Specification**

## **10.1 Agent Overview**

One AI agent — powered by Azure OpenAI GPT-4o — serves all four user types across all four channels. It speaks seven languages, remembers every user's context, and can execute financial actions mid-conversation through Squad API function calls. It operates as a voice agent on the website (Vapi), a voice \+ text agent on the offline phone line (Twilio/Vapi SIP), a text \+ voice note agent on WhatsApp (Meta Business API), and an embedded chat assistant on the web dashboard.

## **10.2 Agent Tools (Function Calling)**

| Tool Name | Triggered When | Action Taken | Squad API Called |
| :---- | :---- | :---- | :---- |
| verify\_bvn | User provides BVN during onboarding | Calls Squad Aggregator API. Returns verified/failed with name. | Squad Aggregator / Sub-merchant API |
| create\_virtual\_account | BVN verified successfully | Calls Squad POST /virtual-account. Returns NUBAN to agent. | POST /virtual-account |
| create\_escrow | Employer and worker agree on a price | Calls Squad Dynamic Virtual Account API. Returns unique escrow NUBAN for this job. | Squad Dynamic VA v2 |
| release\_escrow | Both parties confirm job completion | Calls Squad Transfer API to release funds minus platform fee. | Squad Transfer API |
| generate\_payment\_link | School needs fee invoice, trader needs client invoice | Calls Squad Payment Links API. Returns shareable URL. | Squad Payment Links API |
| send\_transfer | Gig payout, stipend disbursement | Calls Squad Transfer API single with amount and recipient. | Squad Transfer API |
| get\_balance | Any user asks for their balance | Calls Squad /payout/list. Returns current ledger balance. | Squad /payout/list |
| get\_credit\_score | User asks about loan eligibility | Calls Azure ML XGBoost endpoint with transaction features. Returns score 300–850. | Azure ML Endpoint |
| match\_gig | Graduate asks for work | Queries OpportunityPool and GigPosts table. Returns top 3 matches by skill and location. | Internal DB |
| post\_job | Trader or employer describes a job | GPT-4o structures voice/text description into a formatted job post. Saves to GigPosts table. | Internal DB |
| send\_reminder | School asks agent to chase unpaid parents | Fetches unpaid student records. Generates individual payment links. Sends WhatsApp messages. | Squad Payment Links \+ Meta API |
| run\_pl\_analysis | Institution onboarding complete | GPT-4o generates P\&L template based on institution type, size, and location benchmarks. Returns structured financial template. | Internal \+ GPT-4o |

## **10.3 Voice Note Handling on WhatsApp (STT/TTS)**

### **STT Flow — User Speaks, Agent Reads**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **User** | Sends a WhatsApp voice note (e.g., trader describing a job in Hausa) |  |
| **2** | **Meta API** | Delivers audio file URL to Express.js POST /webhooks/whatsapp | *Meta Business API* |
| **3** | **System** | Downloads audio file. Sends to Azure Cognitive Services STT endpoint. | *Azure Speech STT* |
| **4** | **Azure STT** | Returns transcribed text \+ detected language (e.g., ha-NG) |  |
| **5** | **System** | Appends transcribed text to conversation history. Passes to GPT-4o. | *GPT-4o* |
| **6** | **GPT-4o** | Processes intent. Generates text reply. Calls tools if needed. |  |

### **TTS Flow — Agent Speaks Back**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **GPT-4o** | Generates text reply in the user's detected language |  |
| **2** | **System** | Sends text to Azure Cognitive Services TTS with the correct neural voice for that language | *Azure Speech TTS* |
| **3** | **Azure TTS** | Returns MP3 audio file |  |
| **4** | **System** | Uploads MP3 to Azure Blob Storage. Gets public URL. | *Azure Blob Storage* |
| **5** | **System** | Sends audio URL to Meta API as a WhatsApp audio message | *Meta Business API* |
| **6** | **User** | Receives and plays a voice note reply in their own language |  |

**→** *Users choose voice replies vs text replies during onboarding. The agent asks: 'Do you want me to reply with voice or text?' Preference stored in ConversationSessions table.*

## **10.4 Credit Scoring Model (XGBoost on Azure ML)**

| Feature | Description |
| :---- | :---- |
| txn\_frequency\_weekly | Average inbound Squad transactions per week |
| income\_cv | Coefficient of variation of inbound amounts — measures income consistency |
| amount\_trajectory | Month-over-month % change in average transaction value — measures growth |
| recipient\_diversity | Count of unique recipients in outbound transfers — business scaling signal |
| escrow\_usage\_rate | Fraction of transactions using escrow — platform trust signal |
| account\_age\_days | Days since Squad Virtual Account was provisioned |
| completion\_rate | Fraction of posted gigs / jobs completed on-platform |
| repayment\_delta | Days early or late vs scheduled loan repayment — if prior loan exists |

| User Type | 90-Day Squad History | Credit Score | Loan Access |
| :---- | :---- | :---- | :---- |
| Graduate (stipend \+ gigs) | ₦255K across 50+ events | \~650 / 850 | ₦100K via LAPO MFB |
| Trader (inflows \+ outflows) | ₦500K across 120+ events | \~720 / 850 | ₦100K–500K via AB MFB / FairMoney |
| Institution (fee collections) | ₦15M+ across one term | Institutional score | Revenue-based advance via partnered lender |

# **11\. AI Financial Templates for Institutions**

## **11.1 How Templates Are Generated**

Immediately after a school, clinic, or legacy business completes onboarding, GPT-4o generates a fully customized P\&L template. It uses the institution's type, size, location, and fee structure — collected by the voice agent — plus national benchmark data for that institution type in that Nigerian state. The template is displayed on the web dashboard before the user sees anything else.

| Template Section | Content |
| :---- | :---- |
| Income Categories | Pre-populated based on institution type. School: tuition, transport, feeding, uniforms, late fees. Clinic: consultation, lab tests, procedures, pharmacy sales. Workshop: job contracts, materials markup, training fees. |
| Expense Categories | Auto-estimated from national benchmarks: staff salaries by role, utilities (state-adjusted), supplies, rent range for that LGA, transport, maintenance. |
| Net Position | Annual income vs total expenses. Green (surplus) or red (deficit). Exact ₦ gap displayed prominently. |
| AI Recommendations | Up to 3 specific actionable suggestions. Example: 'Your current fee of ₦50K/term creates a ₦12M deficit. Increasing to ₦65K closes the gap. Or: adding 28 students achieves the same result.' Never generic — always specific to their numbers. |
| 12-Month Projection | Month-by-month forecast of cash position based on fee schedule and payment terms. Shows peaks (term start) and troughs (mid-term). |
| Red Flags | Auto-detected: staff costs above 65% of income, fees below breakeven, transport revenue below cost, no emergency fund buffer. |

## **11.2 Template Interaction**

The template is fully editable. Changing any figure triggers instant recalculation of all dependent values. The AI assistant is embedded next to the template — the institution manager can ask: 'What happens if I add 20 more students?' and the agent recalculates and responds immediately. Once accepted, the template becomes the baseline for all dashboard forecasting and payroll automation.

# **12\. Complete System Workflows**

## **12.1 Graduate Full Lifecycle**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Graduate** | Discovers SquadBridge via social media, campus referral, radio ad, or a flyer with the phone number. |  |
| **2** | **Graduate** | Visits website and clicks the chat widget Call button. OR dials the offline phone number. | *Vapi / Twilio* |
| **3** | **Agent** | Conducts 2-minute voice onboarding: user type detected, skills collected, location noted, BVN verified. | *GPT-4o \+ Squad Aggregator* |
| **4** | **System** | Squad Virtual Account provisioned automatically on BVN verification. | *Squad POST /virtual-account* |
| **5** | **System** | Welcome WhatsApp message sent. Graduate's profile saved in DB. | *Meta Business API* |
| **6** | **System** | 8:00 AM next day: first opportunity digest sent on WhatsApp — 3–5 curated gigs and programs matching their skills. | *Azure Function \+ Meta API* |
| **7** | **Graduate** | Sees a gig they like. Replies to apply. Agent notifies the employer/trader. | *GPT-4o* |
| **8** | **Employer** | Accepts via WhatsApp or dashboard. Dynamic VA created. Employer pays into escrow. | *Squad Dynamic VA* |
| **9** | **Graduate** | Completes the work. Employer confirms on WhatsApp or dashboard. |  |
| **10** | **System** | Escrow released. Squad Transfer pays graduate's NUBAN. Webhook fires. | *Squad Transfer \+ Webhooks* |
| **11** | **System** | WhatsApp notification: '₦5,500 received from Apex Logistics. Balance: ₦18,250. Credit score: 410/850.' | *Meta Business API* |
| **12** | **Agent** | If graduate lacks skills for a better gig: identifies gap, recommends specific course, sends link. | *GPT-4o \+ Azure Function* |
| **13** | **Graduate** | Completes course. Badge added. Re-matched to better-paying gigs automatically. |  |
| **14** | **System** | 90 days later: XGBoost model scores ₦255K+ transaction history. Credit score \~650. | *Azure ML Endpoint* |
| **15** | **Agent** | 'You qualify for a ₦100,000 loan via LAPO MFB. Want me to connect you?' Loan application facilitated. | *GPT-4o \+ LAPO API* |

## **12.2 Trader / Artisan Full Lifecycle**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Trader** | Hears about SquadBridge on radio or from a fellow trader. Calls the offline number or visits the website. | *Twilio / Vapi* |
| **2** | **Agent** | Onboards in Hausa, Yoruba, Pidgin, or Igbo depending on trader's language. 2 minutes. BVN via DTMF or secure web field. | *GPT-4o \+ Squad Aggregator* |
| **3** | **System** | Squad Business Virtual Account provisioned. Business name appears on all transfers. | *Squad POST /virtual-account (business)* |
| **4** | **Agent** | 'Share your account number with customers — 0123456789, GTBank, Musa Tailoring. Or I can make you a payment link.' Payment link generated. | *Squad Payment Links API* |
| **5** | **Trader** | Shares payment link on WhatsApp status. Customer clicks link, pays by card or bank transfer. | *Squad Payment Gateway* |
| **6** | **System** | Webhook fires. Payment confirmed. WhatsApp notification sent to trader. | *Squad Webhooks \+ Meta API* |
| **7** | **Trader** | Wants to hire a graduate for data entry. Sends voice note: 'I need someone for 3 days, data entry, 3k per day, Surulere.' |  |
| **8** | **Agent** | STT transcribes voice note. GPT-4o structures it as a job post. Posted to marketplace. Matching graduates notified. | *Azure STT \+ GPT-4o* |
| **9** | **Graduate** | Accepts the gig. Dynamic VA created. Trader pays graduate via platform escrow on completion. | *Squad Dynamic VA \+ Transfer* |
| **10** | **System** | 90 days: ₦500K+ in Squad transactions. XGBoost scores \~720/850. Working capital loan eligibility triggered. | *Azure ML Endpoint* |
| **11** | **Agent** | 'Your business score is 720/850. You qualify for ₦200,000 from FairMoney. Want me to apply?' Facilitated. |  |

## **12.3 School / Legacy Business Full Lifecycle**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Bursar** | Visits app.squadbridge.com. Clicks Call button. Voice agent onboards institution in 2 minutes. | *Vapi \+ GPT-4o* |
| **2** | **System** | BVN verified. Squad Business Virtual Account provisioned. NUBAN generated. | *Squad Aggregator \+ /virtual-account* |
| **3** | **System** | GPT-4o generates customized P\&L financial template based on institution type, size, location. Displayed on dashboard before anything else. | *GPT-4o \+ Azure ML* |
| **4** | **Bursar** | Reviews AI template. Edits figures if needed. Accepts template. Enters web dashboard. | *Web Dashboard* |
| **5** | **Bursar** | Uploads student list CSV (name, class, amount due, parent phone number). Clicks 'Generate All Links'. |  |
| **6** | **System** | Calls Squad Payment Links API once per student. 150 links generated in under 60 seconds. | *Squad Payment Links API* |
| **7** | **System** | Each parent's WhatsApp receives: 'Hi Mr. Okonkwo, Chioma's Term 1 fee of ₦65,000 is due at Sunrise Academy. Pay here: \[link\]' | *Meta Business API* |
| **8** | **Parent** | Clicks link. Pays via card, bank transfer, or USSD on Squad's hosted payment page. | *Squad Payment Gateway* |
| **9** | **System** | Squad webhook fires. Student marked Paid in DB. Dashboard updates live via Socket.io. WhatsApp alert sent to school. | *Squad Webhooks \+ Socket.io* |
| **10** | **System** | Real-time alert if collection pace falls behind: 'At current pace, balance on payroll date will be ₦2.1M — below ₦3.8M payroll. Send reminders?' | *Azure Function \+ Meta API* |
| **11** | **Bursar** | Replies 'Yes send reminders'. Agent sends WhatsApp messages to all unpaid parents with payment links. | *GPT-4o \+ Meta API* |
| **12** | **Azure Function** | On payroll date: checks Squad balance. Calls Squad Bulk Transfer API. All staff paid simultaneously. | *Squad Transfer API (Bulk)* |
| **13** | **System** | WhatsApp confirmation: 'Payroll complete. 22 staff paid ₦1.87M. Balance: ₦4.7M.' Dashboard updated. | *Meta Business API* |
| **14** | **Azure Function** | Nightly: exponential smoothing on actual collection data → 30/60/90 day forecast updated on dashboard. | *Azure Functions* |

## **12.4 Employer / Client Full Lifecycle**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Employer** | Visits website. Clicks Call button. Agent onboards: what work do you need, where, budget. | *Vapi \+ GPT-4o* |
| **2** | **System** | BVN verified. Squad Virtual Account provisioned. Employer dashboard access granted. | *Squad Aggregator \+ /virtual-account* |
| **3** | **Employer** | Logs into dashboard. Browses anonymized talent pool. Sees skill tags, area, completion rate, badge tier. No personal info. | *Web Dashboard* |
| **4** | **Employer** | Clicks 'Request to Hire' on a trader or graduate card. |  |
| **5** | **System** | WhatsApp notification to the worker: 'An employer wants to hire you for \[job\]. Accept or Decline?' | *Meta Business API* |
| **6** | **Worker** | Accepts via WhatsApp. |  |
| **7** | **System** | Squad Dynamic VA created for this job. Employer receives escrow account number and amount. | *Squad Dynamic VA v2* |
| **8** | **Employer** | Transfers job payment into Dynamic VA. Squad holds funds in escrow. | *Squad Payment Gateway* |
| **9** | **System** | Webhook confirms escrow funded. Worker's contact shared. Work begins. | *Squad Webhooks* |
| **10** | **Employer** | Confirms completion via dashboard or WhatsApp when work is done. |  |
| **11** | **System** | Escrow released to worker via Squad Transfer minus 2–3% fee. Both parties notified. | *Squad Transfer API* |
| **12** | **System** | Transaction recorded. Worker credit profile updated. Employer reputation score updated. |  |

## **12.5 USSD Workflow**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **User** | Dials \*556\# from any Nigerian GSM phone. No internet required. | *Africa's Talking* |
| **2** | **System** | Africa's Talking posts to Express.js POST /ussd/callback. Phone number identifies the user in DB. | *Express.js* |
| **3** | **System** | Main menu displayed: 1\. Check Balance 2\. Collections Summary 3\. Recent Payments 4\. Request Payout 5\. Credit Score 0\. Exit |  |
| **4** | **User** | Presses a digit to select option. |  |
| **5** | **System** | Fetches data from Azure SQL / Squad API. Returns formatted response within 10 seconds. | *Azure SQL \+ Squad /payout/list* |
| **6** | **User (Payout)** | Selects Option 4 → enters amount → confirms → transfer queued → receives SMS with reference number. | *Squad Transfer API* |

## **12.6 Offline Phone Agent Workflow**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **User** | Dials SquadBridge phone number from any phone. No internet required. | *Twilio / Vapi SIP* |
| **2** | **System** | AI agent answers within 2 rings. Language detected from first utterance. | *GPT-4o \+ Azure STT* |
| **3** | **Agent** | Conducts voice conversation: onboarding OR balance check OR job posting OR loan query — whatever the user needs. | *GPT-4o* |
| **4** | **Agent (BVN)** | 'Please press your BVN on your keypad now.' DTMF tones captured. | *Twilio DTMF* |
| **5** | **System** | BVN sent to Squad. Account provisioned. Confirmed by agent on the call. | *Squad Aggregator \+ /virtual-account* |
| **6** | **Agent** | Summarises what was done. Tells user: 'Your account is \[NUBAN\]. Call anytime or dial \*556\# for quick checks.' Ends call. |  |

## **12.7 Opportunity Engine Workflow**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Azure Function** | Runs at 6:00 AM WAT daily. Triggers opportunity scraping across 10+ African platforms. | *Azure Functions* |
| **2** | **System** | Playwright/Cheerio scrapes Discovery Africa, Sisterly HQ, Jobberman, MyJobMag, NGCareers, etc. | *Playwright \+ Cheerio* |
| **3** | **GPT-4o** | Tags each opportunity: skill requirements, user type, location, opportunity type. Deduplicated via URL hash. | *GPT-4o* |
| **4** | **System** | Opportunities saved to OpportunityPool table in Azure SQL. | *Azure SQL* |
| **5** | **Azure Function** | At 8:00 AM WAT: matches each graduate's skill profile against OpportunityPool. Selects top 3–5 per user. | *Azure Functions* |
| **6** | **System** | Personalized WhatsApp digest sent to each graduate and eligible trader. | *Meta Business API* |
| **7** | **Graduate** | Replies to apply for an internal gig. Agent handles matching and escrow. | *GPT-4o* |
| **8** | **Graduate** | Clicks external link for outside opportunities (3MTT, ALX, etc.). External site handles application. |  |

# **13\. Backend Architecture (Express.js)**

## **13.1 Project Structure**

| File / Directory | Purpose |
| :---- | :---- |
| src/routes/schools.js | POST /api/v1/schools/onboard, GET dashboard data, P\&L, collections, payroll endpoints |
| src/routes/graduates.js | POST /api/v1/graduates/onboard, GET gigs, POST apply, GET credit score |
| src/routes/traders.js | POST /api/v1/traders/onboard, POST post-job, POST escrow create/release |
| src/routes/employers.js | POST /api/v1/employers/onboard, GET talent pool, POST request-hire |
| src/routes/agent.js | POST /api/v1/agent/message — web chat widget and WhatsApp text handler |
| src/routes/webhooks.js | POST /webhooks/squad/payment, POST /webhooks/whatsapp |
| src/routes/ussd.js | POST /ussd/callback — Africa's Talking USSD handler |
| src/routes/auth.js | POST /api/v1/auth/login, /logout, /refresh |
| src/services/squadService.js | Axios wrapper for all Squad API calls |
| src/services/agentService.js | Azure OpenAI GPT-4o client — conversation history, function calling, tool execution |
| src/services/speechService.js | Azure Cognitive Services — STT (audio→text) \+ TTS (text→audio file→Blob) |
| src/services/creditService.js | Calls Azure ML XGBoost endpoint. Builds feature vector from Squad webhook history. |
| src/services/opportunityService.js | Scrapes external platforms. Tags opportunities via GPT-4o. Sends WhatsApp digests. |
| src/services/whatsappService.js | Meta Business API client — text, audio, template messages |
| src/services/forecastService.js | Exponential smoothing — cash flow projection for institutions |
| src/middleware/auth.js | JWT RS256 validation on all /api/\* routes |
| src/middleware/validateSquadSig.js | HMAC-SHA256 Squad webhook signature verification |
| src/middleware/rateLimiter.js | express-rate-limit — 100 req/15min per IP |
| azure-functions/payrollTrigger.js | Timer trigger — runs payroll on configured date for all institutions |
| azure-functions/forecastTrigger.js | Timer trigger — nightly forecast update for all institutions |
| azure-functions/opportunityTrigger.js | Timer trigger — 6AM daily opportunity scrape \+ 8AM WhatsApp digest |

## **13.2 Webhook Handler — 10-Step Process**

| \# | Actor | Action / System Response | Squad API / Service |
| ----- | :---- | :---- | :---- |
| **1** | **Squad** | POSTs payment event to /webhooks/squad/payment |  |
| **2** | **Express** | validateSquadSig middleware verifies HMAC-SHA256 from x-squad-encrypted-body header. Rejects with 401 if invalid. |  |
| **3** | **Express** | Checks Redis for idempotency key (transaction\_id). If exists: return 202 — already processed. If not: write key with 24hr TTL. | *Redis* |
| **4** | **Express** | Parses event: transaction\_id, amount, payment\_link\_id, virtual\_account\_id, event type, timestamp. |  |
| **5** | **Express** | Routes by event type: payment\_link\_id → student/invoice record | dynamic\_va → escrow | virtual\_account → user wallet inflow | *Azure SQL* |
| **6** | **Express** | Updates payment status, increments collected\_amount, writes Transaction record. | *Azure SQL* |
| **7** | **Express** | Emits Socket.io event to connected dashboard clients with payment data. | *Socket.io* |
| **8** | **Express** | Queues WhatsApp notification to institution/trader/graduate via whatsappService. | *Meta Business API* |
| **9** | **Express** | Appends event to user's CreditProfile transaction history for XGBoost feature extraction. | *Azure SQL* |
| **10** | **Express** | Returns HTTP 202 Accepted within 2 seconds. |  |

# **14\. Database Schema (Azure SQL)**

| Table | Key Columns |
| :---- | :---- |
| Schools | id, name, type, nuban, squad\_merchant\_id, student\_count, fee\_per\_term, staff\_count, avg\_salary, phone, email, bvn\_verified, language\_pref, pl\_template (JSON), payroll\_day |
| Students | id, school\_id (FK), name, class, fee\_amount, fee\_status (paid/unpaid/partial), payment\_link\_id, squad\_link\_url, parent\_phone, parent\_email |
| Graduates | id, name, phone, email, nuban, squad\_merchant\_id, skills\[\] (JSON), language\_pref, credit\_score, bvn\_verified, badge\_tier, location |
| Traders | id, name, business\_name, business\_type, phone, email, nuban, squad\_merchant\_id, language\_pref, credit\_score, bvn\_verified, badge\_tier, location, service\_description |
| Employers | id, name, company, phone, email, nuban, squad\_merchant\_id, bvn\_verified, reputation\_score, dispute\_count |
| GigPosts | id, poster\_id, poster\_type (trader/employer), title, description, skills\_required\[\] (JSON), pay\_amount, duration\_days, location, status (open/filled/closed), created\_at |
| GigApplications | id, gig\_id (FK), applicant\_id, applicant\_type, status (applied/accepted/completed/rejected), applied\_at |
| EscrowAccounts | id, employer\_id (FK), worker\_id, worker\_type, agreed\_amount, squad\_dynamic\_nuban, status (pending/funded/released/disputed), created\_at |
| Transactions | id, user\_id, user\_type, squad\_txn\_id, amount, direction (in/out), status, payment\_method, payment\_link\_id, timestamp |
| PayrollConfigs | id, institution\_id (FK), payroll\_day, total\_amount, status (active/paused) |
| PayrollStaff | id, institution\_id (FK), name, role, bank\_code, account\_number, monthly\_amount |
| PayrollLogs | id, institution\_id (FK), executed\_at, total\_amount, squad\_batch\_id, status, staff\_count |
| CreditProfiles | id, user\_id, user\_type, score (300-850), last\_scored\_at, txn\_count, feature\_snapshot (JSON) |
| Forecasts | id, institution\_id (FK), generated\_at, day30, day60, day90, upper\_bound, lower\_bound, collection\_rate, model\_params (JSON) |
| OpportunityPool | id, source\_url\_hash, title, organization, description, skills\_required\[\] (JSON), type, location, deadline, external\_link, created\_at |
| OpportunitySent | id, user\_id, opportunity\_id (FK), sent\_at |
| TraderBadges | id, trader\_id (FK), tier (1-5), earned\_at, document\_url, test\_score, notes |
| ConversationSessions | id, user\_phone OR web\_session\_id, user\_type, language, messages (JSON), last\_active\_at |

# **15\. Non-Functional Requirements**

## **15.1 Performance**

| Metric | Target |
| :---- | :---- |
| Web dashboard initial load (LCP) | \< 2 seconds |
| Express.js API response (p95) | \< 500ms |
| Squad webhook → Socket.io dashboard update | \< 1 second |
| Website Vapi call connection | \< 2 seconds from button click to agent speaking |
| Offline phone agent answer time | \< 2 rings |
| WhatsApp agent response (text) | \< 3 seconds |
| WhatsApp STT transcription (30s voice note) | \< 5 seconds |
| WhatsApp TTS audio generation | \< 3 seconds |
| Payment link batch (150 students) | \< 60 seconds |
| USSD response | \< 10 seconds (Africa's Talking SLA) |
| Credit score inference (XGBoost) | \< 500ms from Azure ML endpoint |
| Opportunity digest send (1,000 users) | \< 5 minutes |

## **15.2 Security**

* JWT RS256 tokens — verified on every /api/\* request

* Squad webhook HMAC-SHA256 verification — forged requests rejected with 401

* Raw BVN never stored — only Squad-validated sub-merchant ID retained

* All API secrets in Azure Key Vault — read via @azure/keyvault-secrets SDK

* Redis idempotency keys prevent double-counting of webhook events

* Helmet.js — CSP, HSTS, X-Frame-Options, X-XSS-Protection headers

* express-rate-limit — 100 req/15min per IP

* TLS 1.2+ enforced at Azure App Service level

* CORS — only app.squadbridge.com accepted on API routes

* DTMF BVN on phone calls — digits never spoken aloud, captured as tones only

## **15.3 NDPA 2023 Compliance**

| Risk | Mitigation |
| :---- | :---- |
| WhatsApp data routing to Meta servers | WhatsApp is UI-only. No sensitive financial or health data in message body. All structured data captured server-side and stored on Azure. |
| Cross-border data transfer | All data on Azure South Africa North (af-south-1). No data leaves Nigeria's jurisdictional boundary. |
| BVN handling | Processed via Squad PCI-DSS infrastructure only. Never stored in SquadBridge DB. |
| Consent management | Explicit data processing consent collected as named step during onboarding (voice confirmation or WhatsApp Flow). Timestamped and stored indefinitely. |
| Meta service disruption | Africa's Talking USSD \+ SMS \+ Offline phone agent maintain operations if Meta suspends service. |

# **Appendix A: Squad API Master Reference**

| Squad API | Use Case | User Flow(s) |
| :---- | :---- | :---- |
| POST /virtual-account (personal) | Permanent NUBAN for every user at signup | All |
| POST /virtual-account (business) | Business-named NUBAN for schools, clinics, trader businesses | 2, 3 |
| Aggregator / Sub-merchant API | BVN-linked KYC and identity verification | All |
| Dynamic Virtual Account v2 | Per-transaction escrow for employer-worker job agreements | Employer \+ Trader/Graduate |
| Payment Links API | Per-student fee invoices, trader invoices, employer job deposits | 2, 3, Employer |
| Payment Gateway | Card, bank transfer, USSD collections from parents, customers, employers | 2, 3, Employer |
| Transfer API (single) | Gig payouts, escrow release, training stipend disbursement | 1, 2 |
| Transfer API (bulk) | Institution monthly payroll — all staff paid simultaneously | 3 |
| Direct Debit API | Recurring monthly fees — crèches, clinics, cooperatives | 3 |
| Account Lookup API | Verify staff bank accounts before payroll transfer | 3 |
| Webhooks | Real-time event capture — dashboards, WhatsApp alerts, XGBoost credit feed | All |
| /payout/list | Aggregated transaction history for credit score feature extraction | All |

**SquadBridge × Squad by HabariPay**

*Making every transaction count — for the person who made it.*