# CRONOS ARMY - ARCHITECTURE SPECIFICATION

**Version**: 2.0
**Status**: REFACTORING IN PROGRESS
**Last Updated**: 2025-10-28

---

## TABLE OF CONTENTS

1. [Current State Analysis](#current-state-analysis)
2. [Target Architecture](#target-architecture)
3. [Domain Model](#domain-model)
4. [Layer Responsibilities](#layer-responsibilities)
5. [Data Flow](#data-flow)
6. [Implementation Guide](#implementation-guide)
7. [Migration Strategy](#migration-strategy)

---

## CURRENT STATE ANALYSIS

### Critical Issues Identified

#### 1. **Architectural Violations (15+ found)**

| Violation | Location | Impact |
|-----------|----------|--------|
| UI calculates game mechanics | `SoldierCard.tsx:73-74` | Inconsistent logic |
| Database does business logic | `calculate_current_energy()` SQL function | Hard to test/change |
| API routes with 400+ line calculations | `attack/route.ts:16-580` | Unmaintainable |
| 15+ different Soldier type definitions | Scattered across components | Type confusion |
| Power calculations in 4 places | Routes, services, DB, components | Inconsistency risk |
| No DTO/transformation layer | All files | Raw DB data in UI |

#### 2. **Where Things Currently Live**

```
CALCULATIONS FOUND IN:
├── React Components (12 violations)
│   ├── Quota calculations in SoldierCard
│   ├── Power display calculations
│   └── Energy percentage calculations
├── Database Functions (6 violations)
│   ├── Energy recovery formula
│   ├── Power calculation
│   └── Training XP rewards
├── API Routes (8 violations)
│   ├── Battle outcome simulation
│   ├── Power calculations
│   └── Territory validation
└── Services (CORRECT - but underutilized)
    ├── BattleManager exists but not used
    └── EnergyManager wraps DB instead of owning logic
```

#### 3. **Soldier Object Chaos**

**15 different Soldier definitions across codebase!**

Each component defines its own:
- `battlefield/page.tsx` - Interface Soldier
- `components/soldiers/SoldierCard.tsx` - Interface Soldier
- `components/territories/TerritoryDetailsPanel.tsx` - Interface Soldier
- ... 12 more ...

**Result**:
- Confusion about which properties are available
- No clear distinction between raw data vs calculated
- Impossible to maintain consistency

---

## TARGET ARCHITECTURE

### Guiding Principles

1. **Separation of Concerns**
   - UI: Render only, zero calculations
   - API: HTTP handling only, thin controllers
   - Services: ALL business logic
   - Database: Storage only, no computations

2. **Single Source of Truth**
   - One canonical type per domain object
   - One calculation method per metric
   - One configuration source per setting

3. **Clear Data Flow**
   - Database → Entities (raw data)
   - Entities → DTOs (via transformers)
   - DTOs → ViewModels (API layer)
   - ViewModels → UI (presentation)

4. **Domain-Driven Design**
   - Rich domain models with methods
   - Business logic lives in domain services
   - Entities are self-contained

### Architecture Layers

```
┌───────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                         │
│                   (React Components)                           │
│                                                                │
│  Responsibilities:                                             │
│  ✓ Render UI                                                  │
│  ✓ Handle user interactions                                   │
│  ✓ Call API endpoints                                         │
│                                                                │
│  Prohibited:                                                   │
│  ✗ Calculations                                               │
│  ✗ Business logic                                             │
│  ✗ Direct database access                                     │
│  ✗ Raw data transformation                                    │
│                                                                │
│  Receives: ViewModels (presentation-ready data)               │
└───────────────────────────────────────────────────────────────┘
                              ↓
                         ViewModels
                              ↓
┌───────────────────────────────────────────────────────────────┐
│                       API LAYER                                │
│                  (Next.js Route Handlers)                      │
│                                                                │
│  Responsibilities:                                             │
│  ✓ HTTP request/response handling                             │
│  ✓ Authentication/authorization                               │
│  ✓ Input validation (shape only)                              │
│  ✓ Call service layer                                         │
│  ✓ Transform entities → ViewModels                            │
│                                                                │
│  Prohibited:                                                   │
│  ✗ Business logic                                             │
│  ✗ Calculations                                               │
│  ✗ Direct database queries                                    │
│  ✗ Complex transformations                                    │
│                                                                │
│  Target Size: 30-50 lines per route                           │
└───────────────────────────────────────────────────────────────┘
                              ↓
                            DTOs
                              ↓
┌───────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                               │
│                  (Business Logic)                              │
│                                                                │
│  Core Services:                                                │
│  • SoldierService (power, stats, management)                  │
│  • EnergyService (recovery, consumption, calculations)        │
│  • BattleService (combat, rounds, outcomes)                   │
│  • TerritoryService (ownership, validation, stakes)           │
│  • XPService (leveling, progression, rewards)                 │
│  • InventoryService (gear, equipment)                         │
│                                                                │
│  Responsibilities:                                             │
│  ✓ ALL business logic                                         │
│  ✓ ALL calculations                                           │
│  ✓ Game rule enforcement                                      │
│  ✓ Orchestrate repositories                                   │
│  ✓ Entity transformations                                     │
│  ✓ Validation (business rules)                                │
│                                                                │
│  Prohibited:                                                   │
│  ✗ HTTP handling                                              │
│  ✗ Direct SQL queries                                         │
│  ✗ UI concerns                                                │
└───────────────────────────────────────────────────────────────┘
                              ↓
                          Entities
                              ↓
┌───────────────────────────────────────────────────────────────┐
│                   REPOSITORY LAYER                             │
│                  (Data Access)                                 │
│                                                                │
│  Core Repositories:                                            │
│  • SoldierRepository (CRUD soldiers)                          │
│  • TerritoryRepository (CRUD territories)                     │
│  • BattleRepository (CRUD battles)                            │
│  • NotificationRepository (CRUD notifications)                │
│                                                                │
│  Responsibilities:                                             │
│  ✓ Database queries (CRUD)                                    │
│  ✓ Return raw entities                                        │
│  ✓ Data mapping (DB rows → Entities)                          │
│  ✓ Transaction management                                     │
│                                                                │
│  Prohibited:                                                   │
│  ✗ Business logic                                             │
│  ✗ Calculations                                               │
│  ✗ Transformations beyond DB mapping                          │
│  ✗ API concerns                                               │
└───────────────────────────────────────────────────────────────┘
                              ↓
                          Database
                              ↓
┌───────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                              │
│                 (PostgreSQL via Supabase)                      │
│                                                                │
│  Responsibilities:                                             │
│  ✓ Store data                                                 │
│  ✓ Enforce constraints (foreign keys, unique, etc)            │
│  ✓ Maintain indexes                                           │
│  ✓ Handle transactions                                        │
│                                                                │
│  Prohibited:                                                   │
│  ✗ Business logic functions                                   │
│  ✗ Calculated columns (use views if needed)                   │
│  ✗ Game mechanics                                             │
│                                                                │
│  Note: Remove calculate_current_energy() and similar          │
└───────────────────────────────────────────────────────────────┘
```

---

## DOMAIN MODEL

### Core Domain Objects

```typescript
/app/domain/
  ├── entities/           (Raw data from database)
  ├── models/             (Rich domain models with methods)
  ├── services/           (Business logic)
  ├── repositories/       (Data access)
  ├── transformers/       (Entity ↔ DTO ↔ ViewModel)
  └── types/              (Shared types)
```

---

### 1. SOLDIER DOMAIN

#### A. Entity (Raw Database Data)

```typescript
// /app/domain/entities/SoldierEntity.ts
/**
 * SoldierEntity - Raw data from database
 * This is what comes directly from the soldiers table
 * NO calculated properties, NO business logic
 */
export interface SoldierEntity {
  // Identity
  id: string;                    // UUID
  token_id: number;              // NFT token ID
  wallet_address: string;        // Owner wallet (lowercase)

  // NFT Metadata (immutable from mint)
  name: string;
  role: 'Propagandist' | 'Scout' | 'Sniper' | 'Quartermaster';
  archetype: 'WW2 Veteran' | 'Dutch Hero' | 'Crypto Degen' | 'Meme Lord';
  rank: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  image_url: string;

  // Stats (from soldier_stats table)
  xp: number;                    // Experience points
  level: number;                 // Current level (stored, not calculated)
  missions_completed: number;
  battles_won: number;
  battles_lost: number;

  // Energy (from soldier_energy table)
  energy: number;                // Last known energy (0-100)
  energy_updated_at: string;     // ISO timestamp

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

#### B. Domain Model (Rich Object with Behavior)

```typescript
// /app/domain/models/Soldier.ts
import { SoldierEntity } from '../entities/SoldierEntity';
import { EnergyCalculator } from '../services/EnergyCalculator';
import { PowerCalculator } from '../services/PowerCalculator';
import { GAME_CONFIG } from '@/config/gameBalance';

/**
 * Soldier - Rich domain model
 * Contains calculated properties and behavior
 * Encapsulates business rules
 */
export class Soldier {
  // Raw data (from entity)
  private entity: SoldierEntity;

  // Injected dependencies
  private energyCalc: EnergyCalculator;
  private powerCalc: PowerCalculator;

  constructor(
    entity: SoldierEntity,
    energyCalc: EnergyCalculator,
    powerCalc: PowerCalculator
  ) {
    this.entity = entity;
    this.energyCalc = energyCalc;
    this.powerCalc = powerCalc;
  }

  // === ACCESSORS (Raw Data) ===

  get id(): string { return this.entity.id; }
  get tokenId(): number { return this.entity.token_id; }
  get name(): string { return this.entity.name; }
  get rank(): string { return this.entity.rank; }
  get role(): string { return this.entity.role; }
  get archetype(): string { return this.entity.archetype; }
  get imageUrl(): string { return this.entity.image_url; }
  get walletAddress(): string { return this.entity.wallet_address; }

  // Stats
  get xp(): number { return this.entity.xp; }
  get level(): number { return this.entity.level; }
  get missionsCompleted(): number { return this.entity.missions_completed; }
  get battlesWon(): number { return this.entity.battles_won; }
  get battlesLost(): number { return this.entity.battles_lost; }

  // === CALCULATED PROPERTIES (Read-only) ===

  /**
   * Current energy percentage (0-100)
   * Calculated based on:
   * - Last stored energy
   * - Time elapsed since last update
   * - Recovery rate (10% or 15% per hour)
   */
  get currentEnergy(): number {
    return this.energyCalc.calculateCurrentEnergy(
      this.entity.energy,
      new Date(this.entity.energy_updated_at)
    );
  }

  /**
   * Base power (before energy multiplier)
   * Calculated from:
   * - Base: 10
   * - Rank bonus: 0-100
   * - XP bonus: floor(xp / 100)
   * - Gear bonuses: sum of equipped gear
   */
  get basePower(): number {
    return this.powerCalc.calculateBasePower(this.entity);
  }

  /**
   * Effective power (power × energy%)
   * This is what's used in combat
   */
  get effectivePower(): number {
    return this.powerCalc.calculateEffectivePower(
      this.basePower,
      this.currentEnergy
    );
  }

  /**
   * XP needed to reach next level
   */
  get xpToNextLevel(): number {
    const nextLevel = this.level + 1;
    return GAME_CONFIG.LEVELING.XP_REQUIRED[nextLevel] - this.xp;
  }

  /**
   * Progress to next level (0-1)
   */
  get levelProgress(): number {
    const currentLevelXP = GAME_CONFIG.LEVELING.XP_REQUIRED[this.level];
    const nextLevelXP = GAME_CONFIG.LEVELING.XP_REQUIRED[this.level + 1];
    const xpInLevel = this.xp - currentLevelXP;
    const xpNeededForLevel = nextLevelXP - currentLevelXP;
    return xpInLevel / xpNeededForLevel;
  }

  // === BUSINESS LOGIC METHODS ===

  /**
   * Can this soldier participate in a battle?
   */
  canBattle(): { allowed: boolean; reason?: string } {
    if (this.currentEnergy < GAME_CONFIG.ENERGY.COSTS.BATTLE.MIN) {
      return {
        allowed: false,
        reason: `Insufficient energy (${this.currentEnergy}%). Minimum: ${GAME_CONFIG.ENERGY.COSTS.BATTLE.MIN}%`
      };
    }

    // Add more rules as needed
    return { allowed: true };
  }

  /**
   * Can this soldier start training?
   */
  canTrain(duration: '1h' | '4h' | '12h' | '24h'): { allowed: boolean; reason?: string } {
    const energyCost = GAME_CONFIG.ENERGY.COSTS.TRAINING[duration];

    if (this.currentEnergy < energyCost) {
      return {
        allowed: false,
        reason: `Insufficient energy (${this.currentEnergy}%). Required: ${energyCost}%`
      };
    }

    return { allowed: true };
  }

  /**
   * Award XP and check for level up
   * Returns: { newXP, leveledUp, newLevel }
   */
  awardXP(amount: number): { newXP: number; leveledUp: boolean; newLevel: number } {
    const newXP = this.entity.xp + amount;
    const newLevel = this.calculateLevelFromXP(newXP);
    const leveledUp = newLevel > this.level;

    return { newXP, leveledUp, newLevel };
  }

  private calculateLevelFromXP(xp: number): number {
    const levels = GAME_CONFIG.LEVELING.XP_REQUIRED;
    for (let level = levels.length - 1; level >= 0; level--) {
      if (xp >= levels[level]) {
        return level;
      }
    }
    return 0;
  }

  /**
   * Consume energy for an action
   * Returns: new energy value
   */
  consumeEnergy(amount: number): number {
    const current = this.currentEnergy;
    return Math.max(0, current - amount);
  }

  // === SERIALIZATION ===

  /**
   * Get underlying entity (for persistence)
   */
  toEntity(): SoldierEntity {
    return { ...this.entity };
  }

  /**
   * Create from entity
   */
  static fromEntity(
    entity: SoldierEntity,
    energyCalc: EnergyCalculator,
    powerCalc: PowerCalculator
  ): Soldier {
    return new Soldier(entity, energyCalc, powerCalc);
  }
}
```

#### C. DTO (Data Transfer Object for API)

```typescript
// /app/domain/types/SoldierDTO.ts
/**
 * SoldierDTO - Data shape for API responses
 * Optimized for network transfer
 * Contains both raw data and pre-calculated values
 */
export interface SoldierDTO {
  // Identity
  id: string;
  tokenId: number;
  walletAddress: string;

  // Display Info
  name: string;
  role: string;
  archetype: string;
  rank: string;
  imageUrl: string;

  // Stats
  xp: number;
  level: number;
  missionsCompleted: number;
  battlesWon: number;
  battlesLost: number;

  // Calculated (pre-computed on server)
  energy: number;              // Current energy %
  basePower: number;           // Base power value
  effectivePower: number;      // Power × energy
  xpToNextLevel: number;       // XP needed for next level
  levelProgress: number;       // Progress 0-1

  // Capabilities
  canBattle: boolean;
  canTrain: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

#### D. ViewModel (Presentation Layer)

```typescript
// /app/types/viewmodels/SoldierViewModel.ts
/**
 * SoldierViewModel - UI-ready data
 * Contains formatted strings, display helpers
 * No business logic - pure presentation
 */
export interface SoldierViewModel {
  // Identity
  id: string;
  tokenId: number;

  // Display
  name: string;
  role: string;
  archetype: string;
  rank: string;
  imageUrl: string;

  // Stats (formatted for display)
  level: string;                    // "Level 12"
  xp: string;                       // "1,234 XP"
  xpToNextLevel: string;            // "234 XP to level 13"
  levelProgressPercent: string;     // "67%"

  battlesWon: string;               // "42 victories"
  battlesLost: string;              // "8 defeats"
  winRate: string;                  // "84%"

  // Power (formatted)
  basePower: string;                // "156"
  effectivePower: string;           // "125"
  powerDescription: string;         // "Strong" / "Elite" / etc

  // Energy (formatted)
  energy: string;                   // "78%"
  energyStatus: 'high' | 'medium' | 'low' | 'critical';
  energyColor: string;              // CSS color

  // UI Helpers
  canBattle: boolean;
  canBattleReason?: string;         // Shown in tooltip if false
  canTrain: boolean;

  statusBadge: {
    text: string;                   // "Ready" / "Low Energy" / etc
    color: string;                  // Badge color
  };
}
```

---

### 2. TERRITORY DOMAIN

#### A. Entity (Raw Database Data)

```typescript
// /app/domain/entities/TerritoryEntity.ts
export interface TerritoryEntity {
  // Identity
  id: number;
  name: string;
  tier: 'common' | 'rare' | 'epic' | 'legendary';

  // Geography
  coordinates: { lat: number; lng: number };
  region: string;

  // Ownership (from territory_ownership table)
  owner_wallet?: string;
  soldier_id?: string;             // Defending soldier
  captured_at?: string;

  // Economics
  base_daily_income: number;       // CA tokens per day

  // Status (from territory_status table)
  firewall_until?: string;         // Protection expires at
  cooldown_until?: string;         // Can't attack until
  locked_until?: string;           // Battle in progress
  locked_by_wallet?: string;       // Who's attacking

  // Staking (from ca_stakes table)
  staked_amount: number;           // CA tokens staked
  stake_tier: 0 | 1 | 2 | 3 | 5;   // Stake multiplier

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

#### B. Domain Model

```typescript
// /app/domain/models/Territory.ts
import { TerritoryEntity } from '../entities/TerritoryEntity';
import { GAME_CONFIG } from '@/config/gameBalance';

export class Territory {
  private entity: TerritoryEntity;

  constructor(entity: TerritoryEntity) {
    this.entity = entity;
  }

  // === ACCESSORS ===

  get id(): number { return this.entity.id; }
  get name(): string { return this.entity.name; }
  get tier(): string { return this.entity.tier; }
  get ownerWallet(): string | undefined { return this.entity.owner_wallet; }
  get defendingSoldierId(): string | undefined { return this.entity.soldier_id; }
  get baseDailyIncome(): number { return this.entity.base_daily_income; }

  // === CALCULATED PROPERTIES ===

  /**
   * Is this territory currently owned by anyone?
   */
  get isOwned(): boolean {
    return !!this.entity.owner_wallet;
  }

  /**
   * Is this territory protected by firewall?
   */
  get hasFirewall(): boolean {
    if (!this.entity.firewall_until) return false;
    return new Date(this.entity.firewall_until) > new Date();
  }

  /**
   * Is this territory on cooldown?
   */
  get isOnCooldown(): boolean {
    if (!this.entity.cooldown_until) return false;
    return new Date(this.entity.cooldown_until) > new Date();
  }

  /**
   * Is this territory locked (battle in progress)?
   */
  get isLocked(): boolean {
    if (!this.entity.locked_until) return false;
    return new Date(this.entity.locked_until) > new Date();
  }

  /**
   * Daily income with stake bonus applied
   */
  get effectiveDailyIncome(): number {
    const base = this.entity.base_daily_income;
    const stakeTier = this.entity.stake_tier;
    const bonus = GAME_CONFIG.STAKING.INCOME_BONUS[stakeTier] || 1;
    return base * bonus;
  }

  /**
   * Defense bonus from staking
   */
  get defenseBonus(): number {
    const stakeTier = this.entity.stake_tier;
    return GAME_CONFIG.STAKING.DEFENSE_BONUS[stakeTier] || 0;
  }

  /**
   * Number of battle rounds (based on stake tier)
   */
  get battleRounds(): number {
    return this.entity.stake_tier === 5 ? 4 : 3;
  }

  /**
   * Has watchtower for scout detection?
   */
  get hasWatchtower(): boolean {
    return this.entity.stake_tier >= 3;
  }

  // === BUSINESS LOGIC ===

  /**
   * Can this territory be attacked?
   */
  canBeAttacked(attackerWallet: string): { allowed: boolean; reason?: string } {
    if (this.entity.owner_wallet === attackerWallet) {
      return { allowed: false, reason: 'You already own this territory' };
    }

    if (this.hasFirewall) {
      return { allowed: false, reason: 'Territory is protected by firewall' };
    }

    if (this.isOnCooldown) {
      return { allowed: false, reason: 'Territory is on cooldown after recent battle' };
    }

    if (this.isLocked) {
      return { allowed: false, reason: 'Battle already in progress' };
    }

    return { allowed: true };
  }

  /**
   * Calculate stake requirement for tier
   */
  getStakeRequirement(tier: 1 | 2 | 3 | 5): number {
    return this.baseDailyIncome * tier;
  }

  toEntity(): TerritoryEntity {
    return { ...this.entity };
  }

  static fromEntity(entity: TerritoryEntity): Territory {
    return new Territory(entity);
  }
}
```

---

### 3. BATTLE DOMAIN

#### A. Entity

```typescript
// /app/domain/entities/BattleEntity.ts
export interface BattleEntity {
  id: string;
  territory_id: number;
  attacker_wallet: string;
  defender_wallet: string;

  // Participants
  attacker_soldier_ids: string[];
  defender_soldier_ids: string[];

  // Battle state
  status: 'in_progress' | 'attacker_won' | 'defender_won' | 'retreated';
  current_round: number;
  max_rounds: number;

  // Strategy
  attacker_strategy: 'aggressive' | 'balanced' | 'defensive';
  defender_strategy: 'aggressive' | 'balanced' | 'defensive';

  // Scouting
  scouted: boolean;
  scout_bonus_active: boolean;

  // Timestamps
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export interface BattleRoundEntity {
  id: string;
  battle_id: string;
  round_number: number;

  // Power calculations
  attacker_power: number;
  defender_power: number;

  // Results
  winner: 'attacker' | 'defender';
  attacker_energy_drain: number;
  defender_energy_drain: number;

  // Strategy
  attacker_strategy: string;
  defender_strategy: string;
  strategy_advantage?: 'attacker' | 'defender';

  created_at: string;
}
```

#### B. Domain Model

```typescript
// /app/domain/models/Battle.ts
export class Battle {
  private entity: BattleEntity;
  private rounds: BattleRoundEntity[];

  constructor(entity: BattleEntity, rounds: BattleRoundEntity[] = []) {
    this.entity = entity;
    this.rounds = rounds;
  }

  // === ACCESSORS ===

  get id(): string { return this.entity.id; }
  get territoryId(): number { return this.entity.territory_id; }
  get status(): string { return this.entity.status; }
  get currentRound(): number { return this.entity.current_round; }
  get maxRounds(): number { return this.entity.max_rounds; }

  // === CALCULATED PROPERTIES ===

  get isComplete(): boolean {
    return ['attacker_won', 'defender_won', 'retreated'].includes(this.entity.status);
  }

  get isInProgress(): boolean {
    return this.entity.status === 'in_progress';
  }

  get winner(): 'attacker' | 'defender' | null {
    if (this.entity.status === 'attacker_won') return 'attacker';
    if (this.entity.status === 'defender_won') return 'defender';
    return null;
  }

  get completedRounds(): BattleRoundEntity[] {
    return this.rounds;
  }

  get attackerRoundsWon(): number {
    return this.rounds.filter(r => r.winner === 'attacker').length;
  }

  get defenderRoundsWon(): number {
    return this.rounds.filter(r => r.winner === 'defender').length;
  }

  // === BUSINESS LOGIC ===

  canContinue(): { allowed: boolean; reason?: string } {
    if (this.isComplete) {
      return { allowed: false, reason: 'Battle is already complete' };
    }

    if (this.currentRound >= this.maxRounds) {
      return { allowed: false, reason: 'Maximum rounds reached' };
    }

    return { allowed: true };
  }

  canRetreat(): { allowed: boolean; reason?: string } {
    if (this.isComplete) {
      return { allowed: false, reason: 'Battle is already complete' };
    }

    if (this.currentRound === 0) {
      return { allowed: false, reason: 'Cannot retreat before first round' };
    }

    return { allowed: true };
  }
}
```

---

## LAYER RESPONSIBILITIES

### 1. PRESENTATION LAYER (React Components)

#### Responsibilities
✅ **Render UI elements**
✅ **Handle user interactions** (clicks, form inputs)
✅ **Call API endpoints**
✅ **Display data from ViewModels**
✅ **Local UI state** (modal open/closed, form values)

#### Prohibited
❌ **NO calculations** (power, energy, XP, percentages)
❌ **NO business logic** (validation rules, game mechanics)
❌ **NO data transformations** (raw data → display format)
❌ **NO direct database access**
❌ **NO API business logic**

#### Example: Good Component

```typescript
// /app/components/soldiers/SoldierCard.tsx (REFACTORED)
import { SoldierViewModel } from '@/types/viewmodels/SoldierViewModel';

interface SoldierCardProps {
  soldier: SoldierViewModel;  // ← Presentation-ready data
  onSelect?: (id: string) => void;
}

export function SoldierCard({ soldier, onSelect }: SoldierCardProps) {
  return (
    <div className="soldier-card">
      {/* Identity */}
      <img src={soldier.imageUrl} alt={soldier.name} />
      <h3>{soldier.name}</h3>
      <p>{soldier.role} • {soldier.rank}</p>

      {/* Stats - already formatted */}
      <div className="stats">
        <div>
          <label>Level</label>
          <span>{soldier.level}</span>  {/* "Level 12" */}
        </div>
        <div>
          <label>Power</label>
          <span>{soldier.effectivePower}</span>  {/* "125" */}
          <small>{soldier.powerDescription}</small>  {/* "Strong" */}
        </div>
      </div>

      {/* Energy - pre-calculated with color */}
      <div className="energy-bar">
        <label>Energy</label>
        <div
          className="bar"
          style={{
            width: soldier.energy,  {/* "78%" */}
            backgroundColor: soldier.energyColor
          }}
        />
      </div>

      {/* Status badge - pre-built */}
      <div
        className="status-badge"
        style={{ backgroundColor: soldier.statusBadge.color }}
      >
        {soldier.statusBadge.text}
      </div>

      {/* Actions */}
      <button
        disabled={!soldier.canBattle}
        title={soldier.canBattleReason}
        onClick={() => onSelect?.(soldier.id)}
      >
        Select for Battle
      </button>
    </div>
  );
}

// ✅ Component does ZERO calculations
// ✅ All data comes pre-formatted
// ✅ Pure presentation logic
```

#### Example: Bad Component (Current State)

```typescript
// DON'T DO THIS (current code)
export function SoldierCard({ soldier }) {
  // ❌ VIOLATION: Calculation in component
  const quotaRemaining = soldier.quotaTotal - soldier.quotaUsed;
  const quotaPercentage = (soldier.quotaUsed / soldier.quotaTotal) * 100;

  // ❌ VIOLATION: Business logic in component
  const canBattle = soldier.energy >= 20 && quotaRemaining > 0;

  // ❌ VIOLATION: Data transformation in component
  const energyColor = soldier.energy > 70 ? 'green' :
                      soldier.energy > 30 ? 'yellow' : 'red';

  return (
    <div>
      <span>{quotaPercentage.toFixed(1)}%</span>  {/* ❌ Calculation */}
      <div style={{ backgroundColor: energyColor }} />  {/* ❌ Logic */}
    </div>
  );
}
```

---

### 2. API LAYER (Next.js Routes)

#### Responsibilities
✅ **HTTP request/response handling**
✅ **Authentication** (check wallet, verify signatures)
✅ **Authorization** (check permissions)
✅ **Input validation** (schema/shape only, not business rules)
✅ **Call service layer**
✅ **Transform** DTO → ViewModel
✅ **Error handling** (HTTP status codes)

#### Prohibited
❌ **NO business logic**
❌ **NO calculations**
❌ **NO direct database queries** (use repositories)
❌ **NO complex transformations** (delegate to transformers)

#### Target Size
**30-50 lines per route** (if longer, extract to service)

#### Example: Good API Route

```typescript
// /app/api/soldiers/[id]/route.ts (REFACTORED)
import { NextResponse } from 'next/server';
import { SoldierService } from '@/domain/services/SoldierService';
import { SoldierTransformer } from '@/domain/transformers/SoldierTransformer';
import { authenticate } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 1. Authentication
  const wallet = await authenticate(request);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Input validation (shape only)
  const { id } = params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid soldier ID' }, { status: 400 });
  }

  // 3. Call service (business logic lives here)
  const soldierService = new SoldierService();
  const soldier = await soldierService.getSoldierById(id);

  if (!soldier) {
    return NextResponse.json({ error: 'Soldier not found' }, { status: 404 });
  }

  // 4. Authorization check
  if (soldier.walletAddress !== wallet) {
    return NextResponse.json({ error: 'Not your soldier' }, { status: 403 });
  }

  // 5. Transform to ViewModel
  const viewModel = SoldierTransformer.toViewModel(soldier);

  // 6. Return
  return NextResponse.json(viewModel);
}

// ✅ 35 lines total
// ✅ No business logic
// ✅ No calculations
// ✅ Clear separation of concerns
```

#### Example: Good Battle Route

```typescript
// /app/api/territories/battle/execute-round/route.ts (REFACTORED)
import { NextResponse } from 'next/server';
import { BattleService } from '@/domain/services/BattleService';
import { BattleTransformer } from '@/domain/transformers/BattleTransformer';
import { authenticate } from '@/lib/auth';

export async function POST(request: Request) {
  // 1. Auth
  const wallet = await authenticate(request);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse input
  const { battleId, round } = await request.json();

  // 3. Validate input shape
  if (!battleId || typeof round !== 'number') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // 4. Call service (ALL game logic here)
  const battleService = new BattleService();

  try {
    const result = await battleService.executeRound(battleId, round, wallet);
    const viewModel = BattleTransformer.roundToViewModel(result);
    return NextResponse.json(viewModel);
  } catch (error) {
    if (error instanceof BattleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

// ✅ 40 lines
// ✅ No calculations
// ✅ No power formulas
// ✅ No energy drain logic
// ✅ Just HTTP handling
```

---

### 3. SERVICE LAYER (Business Logic)

#### Core Services

```typescript
/app/domain/services/
  ├── SoldierService.ts        // Soldier management, power, stats
  ├── EnergyService.ts          // Energy calculations, recovery
  ├── BattleService.ts          // Combat mechanics, rounds, outcomes
  ├── TerritoryService.ts       // Territory validation, ownership
  ├── XPService.ts              // Leveling, progression, rewards
  ├── InventoryService.ts       // Gear, equipment, assignments
  ├── NotificationService.ts    // Notifications, alerts
  └── StakingService.ts         // CA token staking
```

#### Responsibilities
✅ **ALL business logic**
✅ **ALL calculations** (power, energy, XP, damage, etc)
✅ **Game rule enforcement**
✅ **Validation** (business rules, not just schema)
✅ **Orchestrate repositories** (coordinate multiple data sources)
✅ **Entity transformations** (Entity → DTO)
✅ **Emit domain events** (for cache invalidation, notifications)

#### Prohibited
❌ **NO HTTP handling**
❌ **NO direct SQL queries** (use repositories)
❌ **NO UI concerns** (formatting, display logic)
❌ **NO database functions** (logic must be in TypeScript)

#### Example: SoldierService

```typescript
// /app/domain/services/SoldierService.ts
import { Soldier } from '../models/Soldier';
import { SoldierRepository } from '../repositories/SoldierRepository';
import { EnergyCalculator } from './calculators/EnergyCalculator';
import { PowerCalculator } from './calculators/PowerCalculator';
import { XPService } from './XPService';
import { Events } from '@/lib/events/EventBus';

export class SoldierService {
  private repo: SoldierRepository;
  private energyCalc: EnergyCalculator;
  private powerCalc: PowerCalculator;
  private xpService: XPService;

  constructor(
    repo: SoldierRepository,
    energyCalc: EnergyCalculator,
    powerCalc: PowerCalculator,
    xpService: XPService
  ) {
    this.repo = repo;
    this.energyCalc = energyCalc;
    this.powerCalc = powerCalc;
    this.xpService = xpService;
  }

  /**
   * Get soldier by ID with all calculated properties
   */
  async getSoldierById(id: string): Promise<Soldier | null> {
    const entity = await this.repo.findById(id);
    if (!entity) return null;

    return Soldier.fromEntity(entity, this.energyCalc, this.powerCalc);
  }

  /**
   * Get all soldiers for a wallet
   */
  async getSoldiersByWallet(wallet: string): Promise<Soldier[]> {
    const entities = await this.repo.findByWallet(wallet);

    return entities.map(entity =>
      Soldier.fromEntity(entity, this.energyCalc, this.powerCalc)
    );
  }

  /**
   * Award XP to soldier and handle level-ups
   */
  async awardXP(
    soldierId: string,
    amount: number,
    reason: string
  ): Promise<{ soldier: Soldier; leveledUp: boolean; oldLevel: number; newLevel: number }> {
    // 1. Load soldier
    const soldier = await this.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    // 2. Calculate new XP/level (business logic in domain model)
    const result = soldier.awardXP(amount);

    // 3. Persist changes
    await this.repo.updateXP(soldierId, result.newXP, result.newLevel);

    // 4. Emit event
    await Events.emit({
      type: 'soldier:xp-awarded',
      soldierId,
      amount,
      reason,
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
    });

    // 5. Return updated soldier
    const updated = await this.getSoldierById(soldierId);

    return {
      soldier: updated!,
      leveledUp: result.leveledUp,
      oldLevel: soldier.level,
      newLevel: result.newLevel,
    };
  }

  /**
   * Consume energy for an action
   */
  async consumeEnergy(
    soldierId: string,
    amount: number,
    action: string
  ): Promise<Soldier> {
    // 1. Load soldier
    const soldier = await this.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    // 2. Check if has enough energy
    if (soldier.currentEnergy < amount) {
      throw new Error(`Insufficient energy. Has: ${soldier.currentEnergy}%, needs: ${amount}%`);
    }

    // 3. Calculate new energy
    const newEnergy = soldier.consumeEnergy(amount);

    // 4. Persist
    await this.repo.updateEnergy(soldierId, newEnergy);

    // 5. Emit event (triggers cache invalidation)
    await Events.emit({
      type: 'soldier:energy-consumed',
      soldierId,
      amount,
      action,
      newEnergy,
    });

    // 6. Return updated
    return await this.getSoldierById(soldierId)!;
  }

  /**
   * Start training session
   */
  async startTraining(
    soldierId: string,
    duration: '1h' | '4h' | '12h' | '24h'
  ): Promise<{ trainingId: string; completesAt: Date }> {
    // 1. Load soldier
    const soldier = await this.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    // 2. Validate can train (business logic in domain model)
    const canTrain = soldier.canTrain(duration);
    if (!canTrain.allowed) {
      throw new Error(canTrain.reason);
    }

    // 3. Get training config
    const config = GAME_CONFIG.TRAINING[duration];

    // 4. Consume energy
    await this.consumeEnergy(soldierId, config.energyCost, 'training');

    // 5. Create training session
    const completesAt = new Date(Date.now() + config.durationMs);
    const trainingId = await this.repo.createTrainingSession({
      soldierId,
      duration,
      xpReward: config.xpReward,
      completesAt,
    });

    // 6. Emit event
    await Events.emit({
      type: 'soldier:training-started',
      soldierId,
      trainingId,
      duration,
      completesAt,
    });

    return { trainingId, completesAt };
  }
}

// ✅ All business logic here
// ✅ Calculations owned by service
// ✅ Events emitted for side effects
// ✅ Testable (inject dependencies)
```

#### Example: BattleService

```typescript
// /app/domain/services/BattleService.ts
export class BattleService {
  private battleRepo: BattleRepository;
  private soldierService: SoldierService;
  private territoryService: TerritoryService;
  private energyService: EnergyService;

  /**
   * Initialize a new battle
   */
  async initializeBattle(params: {
    territoryId: number;
    attackerWallet: string;
    soldierIds: string[];
    strategy: Strategy;
    scouted: boolean;
  }): Promise<Battle> {
    // 1. Validate territory can be attacked
    const territory = await this.territoryService.getById(params.territoryId);
    const canAttack = territory.canBeAttacked(params.attackerWallet);
    if (!canAttack.allowed) {
      throw new BattleError(canAttack.reason!);
    }

    // 2. Validate soldiers can battle
    const attackers = await this.soldierService.getSoldiersByIds(params.soldierIds);
    for (const soldier of attackers) {
      const canBattle = soldier.canBattle();
      if (!canBattle.allowed) {
        throw new BattleError(`${soldier.name}: ${canBattle.reason}`);
      }
    }

    // 3. Get defenders
    const defenders = await this.soldierService.getSoldiersByIds(
      territory.defendingSoldierIds
    );

    // 4. Create battle record
    const battle = await this.battleRepo.create({
      territoryId: params.territoryId,
      attackerWallet: params.attackerWallet,
      defenderWallet: territory.ownerWallet!,
      attackerSoldierIds: params.soldierIds,
      defenderSoldierIds: defenders.map(d => d.id),
      attackerStrategy: params.strategy,
      defenderStrategy: this.chooseDefenderStrategy(defenders),
      maxRounds: territory.battleRounds,
      scouted: params.scouted,
    });

    // 5. Lock territory
    await this.territoryService.lock(params.territoryId, params.attackerWallet);

    // 6. Emit event
    await Events.emit({
      type: 'battle:initialized',
      battleId: battle.id,
      territoryId: params.territoryId,
      attackerWallet: params.attackerWallet,
    });

    return battle;
  }

  /**
   * Execute a battle round
   */
  async executeRound(
    battleId: string,
    round: number,
    wallet: string
  ): Promise<BattleRoundResult> {
    // 1. Load battle
    const battle = await this.battleRepo.findById(battleId);
    if (!battle) throw new BattleError('Battle not found');

    // 2. Validate can execute
    if (battle.attackerWallet !== wallet) {
      throw new BattleError('Not your battle');
    }

    const canContinue = battle.canContinue();
    if (!canContinue.allowed) {
      throw new BattleError(canContinue.reason!);
    }

    // 3. Load soldiers
    const attackers = await this.soldierService.getSoldiersByIds(
      battle.attackerSoldierIds
    );
    const defenders = await this.soldierService.getSoldiersByIds(
      battle.defenderSoldierIds
    );

    // 4. Calculate total power (business logic)
    const attackerPower = this.calculateSquadPower(attackers, battle.attackerStrategy);
    const defenderPower = this.calculateSquadPower(defenders, battle.defenderStrategy);

    // 5. Apply strategy advantages
    const { attackerFinalPower, defenderFinalPower } = this.applyStrategyModifiers(
      attackerPower,
      defenderPower,
      battle.attackerStrategy,
      battle.defenderStrategy
    );

    // 6. Determine round winner
    const roundWinner = attackerFinalPower > defenderFinalPower ? 'attacker' : 'defender';

    // 7. Calculate energy drain
    const dominanceRatio = Math.abs(attackerFinalPower - defenderFinalPower) /
                          Math.max(attackerFinalPower, defenderFinalPower);

    const { attackerDrain, defenderDrain } = this.calculateEnergyDrain(
      dominanceRatio,
      roundWinner,
      round
    );

    // 8. Apply energy drain
    await Promise.all([
      ...attackers.map(s => this.energyService.drainEnergy(s.id, attackerDrain)),
      ...defenders.map(s => this.energyService.drainEnergy(s.id, defenderDrain)),
    ]);

    // 9. Save round result
    const roundResult = await this.battleRepo.createRound({
      battleId,
      roundNumber: round,
      attackerPower: attackerFinalPower,
      defenderPower: defenderFinalPower,
      winner: roundWinner,
      attackerEnergyDrain,
      defenderEnergyDrain,
      attackerStrategy: battle.attackerStrategy,
      defenderStrategy: battle.defenderStrategy,
    });

    // 10. Check if battle is complete
    const defendersAlive = defenders.some(d => d.currentEnergy > 0);
    const battleComplete = !defendersAlive || round >= battle.maxRounds;

    if (battleComplete) {
      await this.completeBattle(battle, roundWinner);
    }

    // 11. Emit event
    await Events.emit({
      type: 'battle:round-executed',
      battleId,
      round,
      winner: roundWinner,
      battleComplete,
    });

    return {
      round: roundResult,
      battleComplete,
      victor: battleComplete ? (defendersAlive ? 'defender' : 'attacker') : null,
    };
  }

  // === PRIVATE CALCULATION METHODS ===

  private calculateSquadPower(soldiers: Soldier[], strategy: Strategy): number {
    const totalPower = soldiers.reduce((sum, s) => sum + s.effectivePower, 0);
    const strategyMultiplier = BATTLE_CONFIG.strategies[strategy].attackBonus;
    return totalPower * strategyMultiplier;
  }

  private applyStrategyModifiers(
    attackerPower: number,
    defenderPower: number,
    attackerStrategy: Strategy,
    defenderStrategy: Strategy
  ): { attackerFinalPower: number; defenderFinalPower: number } {
    // Rock-paper-scissors logic
    const attackerWinsCounter = this.checkStrategyAdvantage(attackerStrategy, defenderStrategy);
    const defenderWinsCounter = this.checkStrategyAdvantage(defenderStrategy, attackerStrategy);

    let attackerFinalPower = attackerPower;
    let defenderFinalPower = defenderPower;

    if (attackerWinsCounter) {
      attackerFinalPower *= BATTLE_CONFIG.strategies.counterBonus;
    }
    if (defenderWinsCounter) {
      defenderFinalPower *= BATTLE_CONFIG.strategies.counterBonus;
    }

    return { attackerFinalPower, defenderFinalPower };
  }

  private checkStrategyAdvantage(strategy1: Strategy, strategy2: Strategy): boolean {
    const counters = {
      aggressive: 'balanced',
      balanced: 'defensive',
      defensive: 'aggressive',
    };
    return counters[strategy1] === strategy2;
  }

  private calculateEnergyDrain(
    dominanceRatio: number,
    winner: 'attacker' | 'defender',
    round: number
  ): { attackerDrain: number; defenderDrain: number } {
    const baselineDrain = BATTLE_CONFIG.energy.lossDrain[round];
    const winnerDrain = baselineDrain * BATTLE_CONFIG.energy.winnerDrainMultiplier;

    const loserDrain = baselineDrain * (1 + dominanceRatio * 0.5);

    return winner === 'attacker'
      ? { attackerDrain: winnerDrain, defenderDrain: loserDrain }
      : { attackerDrain: loserDrain, defenderDrain: winnerDrain };
  }
}

// ✅ All battle mechanics in service
// ✅ No HTTP concerns
// ✅ No SQL queries (uses repos)
// ✅ Testable with mocked dependencies
```

---

### 4. REPOSITORY LAYER (Data Access)

#### Responsibilities
✅ **Database queries** (CRUD operations)
✅ **Return raw entities** (no calculations)
✅ **Data mapping** (DB rows → Entity objects)
✅ **Transaction management**

#### Prohibited
❌ **NO business logic**
❌ **NO calculations**
❌ **NO transformations** (beyond DB → Entity)

#### Example: SoldierRepository

```typescript
// /app/domain/repositories/SoldierRepository.ts
import { SoldierEntity } from '../entities/SoldierEntity';
import { getSupabaseAdmin } from '@/lib/supabase/clients';

export class SoldierRepository {
  private supabase = getSupabaseAdmin();

  /**
   * Find soldier by ID
   */
  async findById(id: string): Promise<SoldierEntity | null> {
    const { data, error } = await this.supabase
      .from('soldiers')
      .select(`
        *,
        soldier_stats(*),
        soldier_energy(*)
      `)
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return this.mapToEntity(data);
  }

  /**
   * Find all soldiers for a wallet
   */
  async findByWallet(wallet: string): Promise<SoldierEntity[]> {
    const { data, error } = await this.supabase
      .from('soldiers')
      .select(`
        *,
        soldier_stats(*),
        soldier_energy(*)
      `)
      .eq('wallet_address', wallet.toLowerCase());

    if (error || !data) return [];

    return data.map(row => this.mapToEntity(row));
  }

  /**
   * Update soldier XP and level
   */
  async updateXP(id: string, xp: number, level: number): Promise<void> {
    await this.supabase
      .from('soldier_stats')
      .update({ xp, level, updated_at: new Date().toISOString() })
      .eq('soldier_id', id);
  }

  /**
   * Update soldier energy
   */
  async updateEnergy(id: string, energy: number): Promise<void> {
    await this.supabase
      .from('soldier_energy')
      .update({
        energy,
        energy_updated_at: new Date().toISOString(),
      })
      .eq('soldier_id', id);
  }

  /**
   * Create training session
   */
  async createTrainingSession(params: {
    soldierId: string;
    duration: string;
    xpReward: number;
    completesAt: Date;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('training_sessions')
      .insert({
        soldier_id: params.soldierId,
        training_type: params.duration,
        xp_reward: params.xpReward,
        completes_at: params.completesAt.toISOString(),
        status: 'in_progress',
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create training session: ${error.message}`);

    return data.id;
  }

  // === PRIVATE MAPPERS ===

  private mapToEntity(row: any): SoldierEntity {
    return {
      id: row.id,
      token_id: row.token_id,
      wallet_address: row.wallet_address,
      name: row.name,
      role: row.role,
      archetype: row.archetype,
      rank: row.rank,
      image_url: row.image_url,
      xp: row.soldier_stats?.xp || 0,
      level: row.soldier_stats?.level || 0,
      missions_completed: row.soldier_stats?.missions_completed || 0,
      battles_won: row.soldier_stats?.battles_won || 0,
      battles_lost: row.soldier_stats?.battles_lost || 0,
      energy: row.soldier_energy?.energy || 100,
      energy_updated_at: row.soldier_energy?.energy_updated_at || row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// ✅ Pure data access
// ✅ No business logic
// ✅ No calculations
// ✅ Clean entity mapping
```

---

### 5. DATABASE LAYER (PostgreSQL)

#### Responsibilities
✅ **Store data**
✅ **Enforce constraints** (foreign keys, unique, not null)
✅ **Maintain indexes** (performance)
✅ **Handle transactions** (ACID)

#### Prohibited
❌ **NO business logic functions** (remove `calculate_current_energy`, etc)
❌ **NO calculated columns** (use views if absolutely needed)
❌ **NO game mechanics in SQL**

#### Schema Design Principles

**Tables should store RAW DATA only:**
```sql
-- Good: Raw data
CREATE TABLE soldiers (
  id UUID PRIMARY KEY,
  token_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  rank TEXT NOT NULL,
  -- No calculated columns
);

-- Good: Separate stats table
CREATE TABLE soldier_stats (
  soldier_id UUID REFERENCES soldiers(id),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  -- Raw counters only
);

-- Good: Energy state (not calculated)
CREATE TABLE soldier_energy (
  soldier_id UUID REFERENCES soldiers(id),
  energy INTEGER NOT NULL DEFAULT 100,
  energy_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Calculation happens in TypeScript
);
```

**Remove all business logic functions:**
```sql
-- ❌ DELETE THESE FUNCTIONS
DROP FUNCTION IF EXISTS calculate_current_energy(UUID);
DROP FUNCTION IF EXISTS calculate_soldier_power(UUID);
DROP FUNCTION IF EXISTS start_soldier_training(...);
DROP FUNCTION IF EXISTS complete_training(UUID);

-- ✅ Keep only data integrity functions
CREATE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## DATA FLOW

### Complete Request Flow Example: "View Soldier"

```
1. USER CLICKS SOLDIER CARD
   └─> Component calls: /api/soldiers/123

2. API ROUTE (/app/api/soldiers/[id]/route.ts)
   ├─> Authenticate request
   ├─> Validate soldier ID
   └─> Call: SoldierService.getSoldierById('123')

3. SOLDIER SERVICE (/app/domain/services/SoldierService.ts)
   ├─> Call: SoldierRepository.findById('123')
   ├─> Returns: SoldierEntity (raw DB data)
   ├─> Create: Soldier domain model
   ├─> Soldier calculates:
   │   ├─> currentEnergy (via EnergyCalculator)
   │   ├─> basePower (via PowerCalculator)
   │   ├─> effectivePower (power × energy)
   │   └─> levelProgress, xpToNextLevel, etc
   └─> Returns: Soldier (rich domain model)

4. API ROUTE (continued)
   ├─> Transform: SoldierTransformer.toViewModel(soldier)
   ├─> ViewModel includes:
   │   ├─> Formatted strings ("Level 12", "1,234 XP")
   │   ├─> Display helpers (colors, status badges)
   │   └─> UI flags (canBattle, canTrain)
   └─> Return: NextResponse.json(viewModel)

5. COMPONENT RECEIVES ViewModel
   └─> Render: Display pre-formatted data

```

### Data Transformation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  DATABASE                                                    │
│  Raw columns                                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ Repository.findById()
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  ENTITY (SoldierEntity)                                      │
│  {                                                           │
│    id: "uuid",                                              │
│    name: "Captain America",                                 │
│    rank: "Epic",                                            │
│    xp: 1234,                                                │
│    level: 12,                                               │
│    energy: 78,                                              │
│    energy_updated_at: "2025-10-28T10:00:00Z"               │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ Soldier.fromEntity()
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  DOMAIN MODEL (Soldier)                                      │
│  {                                                           │
│    // Raw accessors                                         │
│    id: "uuid",                                              │
│    name: "Captain America",                                 │
│    rank: "Epic",                                            │
│                                                              │
│    // Calculated properties (getters)                       │
│    currentEnergy: 85,        ← Calculated with recovery     │
│    basePower: 156,           ← Rank + XP + gear             │
│    effectivePower: 133,      ← basePower × (energy / 100)   │
│    xpToNextLevel: 266,       ← Config.XP[13] - xp           │
│    levelProgress: 0.67,      ← Within-level progress        │
│                                                              │
│    // Business methods                                       │
│    canBattle(): { allowed: true },                          │
│    canTrain('4h'): { allowed: true }                        │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ SoldierTransformer.toViewModel()
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  VIEW MODEL (SoldierViewModel)                               │
│  {                                                           │
│    id: "uuid",                                              │
│    name: "Captain America",                                 │
│    rank: "Epic",                                            │
│    imageUrl: "https://...",                                 │
│                                                              │
│    // Formatted for display                                 │
│    level: "Level 12",                                       │
│    xp: "1,234 XP",                                          │
│    xpToNextLevel: "266 XP to level 13",                     │
│    levelProgressPercent: "67%",                             │
│                                                              │
│    energy: "85%",                                           │
│    energyStatus: "high",                                    │
│    energyColor: "#10b981",                                  │
│                                                              │
│    basePower: "156",                                        │
│    effectivePower: "133",                                   │
│    powerDescription: "Elite",                               │
│                                                              │
│    statusBadge: {                                           │
│      text: "Ready for Battle",                             │
│      color: "#10b981"                                       │
│    },                                                        │
│                                                              │
│    canBattle: true,                                         │
│    canBattleReason: null                                    │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ API returns JSON
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  COMPONENT (SoldierCard)                                     │
│  Renders:                                                    │
│  • <h3>{soldier.name}</h3>                                  │
│  • <span>{soldier.level}</span>                             │
│  • <div style={{ color: soldier.energyColor }}>            │
│      {soldier.energy}                                       │
│    </div>                                                    │
│  • <Badge color={soldier.statusBadge.color}>                │
│      {soldier.statusBadge.text}                             │
│    </Badge>                                                  │
│                                                              │
│  ✅ ZERO calculations                                        │
│  ✅ ZERO business logic                                      │
│  ✅ Pure presentation                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION GUIDE

### File Structure

```
/app/
  ├── api/                        # API routes (thin controllers)
  │   ├── soldiers/
  │   │   ├── [id]/route.ts       # GET soldier (30 lines)
  │   │   └── by-wallet/route.ts  # GET wallet soldiers (35 lines)
  │   ├── territories/
  │   │   └── battle/
  │   │       ├── init/route.ts         # POST initialize (40 lines)
  │   │       ├── execute-round/route.ts  # POST execute (40 lines)
  │   │       ├── continue/route.ts     # POST continue (25 lines)
  │   │       └── retreat/route.ts      # POST retreat (30 lines)
  │   └── ...
  │
  ├── components/                 # React components (presentation only)
  │   ├── soldiers/
  │   │   ├── SoldierCard.tsx     # Zero calculations
  │   │   └── SoldierList.tsx
  │   ├── territories/
  │   │   └── TerritoryMap.tsx
  │   └── battles/
  │       └── BattleModal.tsx
  │
  ├── domain/                     # Core business logic (NEW)
  │   ├── entities/               # Raw database entities
  │   │   ├── SoldierEntity.ts
  │   │   ├── TerritoryEntity.ts
  │   │   ├── BattleEntity.ts
  │   │   └── ...
  │   │
  │   ├── models/                 # Rich domain models
  │   │   ├── Soldier.ts          # Soldier class with calculated properties
  │   │   ├── Territory.ts        # Territory class with business rules
  │   │   ├── Battle.ts           # Battle class with game logic
  │   │   └── ...
  │   │
  │   ├── services/               # Business logic services
  │   │   ├── SoldierService.ts   # Soldier operations
  │   │   ├── EnergyService.ts    # Energy calculations
  │   │   ├── BattleService.ts    # Battle mechanics
  │   │   ├── TerritoryService.ts # Territory management
  │   │   ├── XPService.ts        # Leveling system
  │   │   ├── InventoryService.ts # Gear management
  │   │   └── calculators/        # Calculation utilities
  │   │       ├── EnergyCalculator.ts
  │   │       ├── PowerCalculator.ts
  │   │       └── DamageCalculator.ts
  │   │
  │   ├── repositories/           # Data access layer
  │   │   ├── SoldierRepository.ts
  │   │   ├── TerritoryRepository.ts
  │   │   ├── BattleRepository.ts
  │   │   └── ...
  │   │
  │   ├── transformers/           # Data transformations
  │   │   ├── SoldierTransformer.ts   # Entity → DTO → ViewModel
  │   │   ├── TerritoryTransformer.ts
  │   │   ├── BattleTransformer.ts
  │   │   └── ...
  │   │
  │   └── types/                  # Domain types
  │       ├── SoldierDTO.ts
  │       ├── TerritoryDTO.ts
  │       ├── BattleDTO.ts
  │       └── ...
  │
  ├── types/                      # Application types
  │   ├── database.ts             # Supabase generated types
  │   ├── viewmodels/             # UI presentation types
  │   │   ├── SoldierViewModel.ts
  │   │   ├── TerritoryViewModel.ts
  │   │   └── ...
  │   └── ...
  │
  └── lib/                        # Shared utilities (NOT business logic)
      ├── auth/                   # Authentication
      ├── cache/                  # Caching
      ├── events/                 # Event bus
      ├── supabase/               # Supabase clients
      └── utils/                  # Generic utilities (formatting, etc)
```

---

## MIGRATION STRATEGY

### Phase 1: Create Domain Layer (Week 1)
1. Create `/app/domain/` folder structure
2. Define all Entity types (Soldier, Territory, Battle, etc)
3. Create Repository interfaces
4. **DO NOT touch existing code yet**

### Phase 2: Implement Repositories (Week 1-2)
1. Create SoldierRepository (extract queries from existing code)
2. Create TerritoryRepository
3. Create BattleRepository
4. Write unit tests for repositories

### Phase 3: Implement Domain Models (Week 2)
1. Create Soldier class with calculated properties
2. Create Territory class with business rules
3. Create Battle class
4. Move calculation logic from existing code into models

### Phase 4: Implement Services (Week 2-3)
1. Create SoldierService (extract logic from API routes)
2. Create EnergyService (extract from database functions)
3. Create BattleService (extract from battleManager + API routes)
4. Write comprehensive unit tests

### Phase 5: Create Transformers (Week 3)
1. Entity → DTO transformers
2. DTO → ViewModel transformers
3. Document all transformation rules

### Phase 6: Refactor API Routes (Week 3-4)
1. Update one route at a time
2. Use feature flags to switch between old/new
3. Test extensively
4. Example: `/api/soldiers/[id]/route.ts`
   - Before: 200 lines with queries + calculations
   - After: 35 lines calling SoldierService

### Phase 7: Refactor Components (Week 4)
1. Update components to expect ViewModels
2. Remove all calculations from UI
3. Update API calls to new endpoints

### Phase 8: Remove Database Functions (Week 5)
1. Verify all logic moved to TypeScript
2. Drop `calculate_current_energy()` function
3. Drop `calculate_soldier_power()` function
4. Drop all other business logic functions

### Phase 9: Clean Up (Week 5-6)
1. Delete old code files
2. Update documentation
3. Final testing
4. Deploy

---

## SUCCESS METRICS

### Code Quality
- ✅ **API routes**: Average 30-50 lines (down from 200-900)
- ✅ **Components**: Zero calculations
- ✅ **Database**: Zero business logic functions
- ✅ **Test coverage**: 80%+ on services

### Architecture Compliance
- ✅ **One Soldier type** (down from 15)
- ✅ **One power calculation** (down from 4 locations)
- ✅ **Clear layer boundaries** (no violations)

### Maintainability
- ✅ **Change battle formula**: Edit one file (BattleService)
- ✅ **Change energy recovery**: Edit one file (EnergyService)
- ✅ **Add new soldier stat**: Add to Entity, Model, DTO, ViewModel (clear path)

---

## CONCLUSION

This architecture provides:
1. **Clear separation of concerns** (UI, API, Services, Data)
2. **Single source of truth** (one type, one calculation per concept)
3. **Testability** (services fully unit-testable)
4. **Maintainability** (business logic in one place)
5. **Scalability** (add features without breaking existing code)

**Next Steps**: Begin Phase 1 (Create Domain Layer) and proceed systematically through migration phases.