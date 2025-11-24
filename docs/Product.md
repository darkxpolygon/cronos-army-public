*A high-level breakdown of how the Cronos Army ecosystem works — from gameplay logic to smart contracts, cross-chain architecture, and the upcoming AI layer.*

---

***Table of Contents***

---

# **Game Architecture**

## **The Four-Layer Architecture**

```
     ┌──────────────────────────┐
     │    Layer 4 — AI Layer    │
     │  (Memory, Personality,   │
     │     Autonomous Logic)    │
     └──────────────▲───────────┘
                    │
     ┌──────────────┴───────────┐
     │  Layer 3 — Token Layer   │
     │ (Economy, Incentives,    │
     │    Burns, Rewards)       │
     └──────────────▲───────────┘
                    │
     ┌──────────────┴───────────┐
     │   Layer 2 — NFT Layer    │
     │ (Identity, Ownership,    │
     │   Soldiers, Traits)      │
     └──────────────▲───────────┘
                    │
     ┌──────────────┴───────────┐
     │ Layer 1 — Game Layer     │
     │ (UI, Missions, Battles,  │
     │  Buildings, Territories) │
     └──────────────────────────┘

```

## **Layer 1 — Game Layer (Experience Layer)**

Handles all gameplay logic:

- Missions (Train & Earn)
- Territory battles
- PvP challenges
- Buildings & power progression
- Player dashboards, army management
- Marketplace UI

<aside>
👉

Deliver a fast, fun, frictionless gaming experience.

</aside>

---

### **Layer 2 — NFT Layer (Identity & Ownership)**

Represents each artifact as a unique on-chain asset:

- Soldiers
- Gears
- Territories

<aside>
👉

Ensure every player owns their progress.

</aside>

---

### **Layer 3 — Token Layer (Economy & Incentives)**

Powered by **$CA**:

- Staking to activate rewards
- Required for minting soldiers
- Burned when minting gears
- Burned when minting territories
- AI action fuel (burning) (soon)

Powered by $CRO:

- Player rewards
- Credit buys

<aside>
👉

Create a sustainable loop that *consumes* $CA and rewards players sustainably.

</aside>

---

### **Layer 4 — AI Layer (Future: Autonomous Soldiers)**

Adds:

- Memory
- Strategy preference
- Behavior patterns
- Communication (Telegram / Discord)
- Autonomous training / scouting

<aside>
👉

Transform NFTs into **living agents** instead of static assets.

</aside>

# **Gameplay Overview**

| **Training** | • Short missions every few minutes
• Earn XP, gear, and credits
• Core retention loop |
| --- | --- |
| **Territory System (Conquer & Earn)** | • PvP-based capture
• Earn CRO
• Each territory has power levels
• Attack, defend, and fortify
• Scaling to 100+ territories as userbase grows |
| **PvP Battles (Tournaments & 1v1)** | • Active battles or deploy soldiers for longer periods
• Earn DP to develop bases and build facilities |
| **Buildings System (Base Development)** | Players manage a strategic bases and build facilities:
• Training center
• Armory
• Resource generators
• Defense tower
• Each building upgrades over time
• Creates long-term progression incentives |
| **Army Composition** | • Soldiers are divided into ranks
• Rarities (Private → General → Legendary)
• Gear items influence power
• Squads of 3 determine mission efficiency
• Bigger armies = deeper strategy |

### **Retention Loop**

We use 3 proven retention drivers:

1. **Daily Check-ins for faster progress (training and facility building**
2. **Leaderboards & rewards**
3. **Marketplace flips & trading meta**

Players check in multiple times per day due to short mission cycles.

Moreover, players get notified via Telegram about updates (e.g. soldier completed a training, territory lost, etc.)

---

# **Technology Stack**

## **Frontend Architecture (Game Interface Layer)**

Cronos Army runs on a modern, scalable, fully Web3-enabled frontend stack designed for speed, reliability, and cross-chain expansion.

**Core Technologies**

- **Next.js (React)** — high-performance frontend framework
- **TypeScript** — type-safe, maintainable codebase
- **TailwindCSS** — consistent design system
- **Framer Motion** — smooth animations & transitions
- **RainbowKit + Wagmi** — wallet connections & Web3 state

**Key Concepts**

- **Modular UI architecture**: soldiers, territories, battles, gear, marketplace are all separate domains
- **Game state hydration** via React Query (caching & syncing data)
- **Device-agnostic UI**: desktop + mobile optimized
- **Real-time UX** with Web3 events + Redis caching

## **Backend Architecture (Game Logic & API Layer)**

The backend is built on a serverless model using **Next.js API routes**, enabling instant scaling and low-latency requests.

**Core Capabilities**

- **REST API for all gameplay actions** (battles, missions, staking, marketplace)
- **JWT authentication** (wallet-signature based)
- **Rate-limiting & anti-abuse mechanisms**
- **Background jobs** for:
    - staking settlements
    - territory rotations
    - marketplace updates
    - reward cycles

**Game Logic Modules**

- **Soldier Logic**: minting, XP leveling, power calculation
- **Battle Engine**: multi-round calculations, outcomes, rewards
- **Territory Engine**: ownership, sieges, passive income
- **Facility Engine**: construction, upgrades, buffs
- **Marketplace Engine**: listings, purchases, transfers

Clean separation → easy to scale, test, and expand.

## **Database Architecture**

Powered by **Supabase (PostgreSQL)** with **Redis** as a high-speed cache.

**Postgres stores:**

- Soldiers, gear, facilities
- Battles & missions
- Territories & ownership
- Marketplace listings
- User credits & progression
- Event logs & analytics

**Redis handles:**

- Hot data (soldier stats, battle states)
- Leaderboards
- Caching blockchain events

**Security Layer**

- Row Level Security (RLS) on all user data
- Strict schema rules & audit logs

## **Blockchain Architecture**

Cronos Army is fully on-chain where it matters — ownership, battles, territories, and asset transfers.

**Supported Chains**

- **Cronos** (primary)
- **BNB Chain** (planned expansion)

**Smart Contracts**

- Soldier NFTs (ERC-721)
- Gear NFTs
- Base Territories NFTs
- Payment Processor
- Staking & Rewards

### **Cross-Chain**

- **LayerZero V2** for bridging $CA
- Unified metadata standard across chains

## **Infrastructure & DevOps**

Designed for stability and near-zero downtime.

**Hosting**

- **Frontend & API** — Render (serverless scaling)
- **Database** — Supabase Cloud
- **Cache** — Upstash Redis
- **Storage & Metadata** — Pinata (IPFS)

**Monitoring**

- Error tracking
- Blockchain event sync health
- Cache hit/miss analytics
- Performance metrics

## **Future Technical Roadmap (Simplified)**

**Q4 2025 / Q1 2026**

- Wallet-less onboarding (email → instant gameplay)
- First AI Soldier prototypes (memory + personality)

**2026**

- Autonomous soldier layer (AI decision-making)
- Territory expansion engine
- Mobile app (wrapper)