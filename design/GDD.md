# Medieval Towns — Game Design Document

> Single source of truth for the entire implementation. All formulas, mechanics, and rules here are authoritative.

---

## 1. Project Overview

Browser-based multiplayer strategy game inspired by Tribal Wars. Players manage medieval villages: gather resources, construct buildings, train military units, and attack other players on a shared map. The game runs in real time — resources accumulate and troop movements resolve even while players are offline.

---

## 2. Tech Stack & Workflow

| Concern | Choice |
|---|---|
| Frontend canvas | Pixi.js |
| Frontend UI | React + Context API |
| Backend | NestJS |
| Database | PostgreSQL (via TypeORM) |
| Container | Docker |
| Architecture | Screaming Architecture (both frontend and backend) |
| Testing | TDD |
| Commits | Conventional Commits |
| Branching | Trunk-based development |
| Var Naming | camelCase |
| File Naming | kebab-case |

---

## 3. Resources

Three resources: **Wood**, **Clay**, **Iron**.

- Resources accumulate passively (offline-safe) up to the Warehouse capacity.
- Production is calculated **lazily** — no background job per player. On any request that needs the resource stock, the server computes:

```
elapsed = now - village.resourcesLastUpdatedAt
wood   += floor(elapsed_hours × timberCamp.productionPerHour)
clay   += floor(elapsed_hours × clayPit.productionPerHour)
iron   += floor(elapsed_hours × ironMine.productionPerHour)

wood = min(wood, warehouse.capacity)
clay = min(clay, warehouse.capacity)
iron = min(iron, warehouse.capacity)

village.resourcesLastUpdatedAt = now
```

- `resourcesLastUpdatedAt` is persisted on the `Village` entity.
- Production is calculated from the building's **current level** at the moment of the request.

### 3.1 Production Formula

All three extractors share the same formula:

```
production(level) = floor(30 × 1.163^level)   // units/hour
```

| Level | Units/hour |
|---|---|
| 1 | 30 |
| 2 | 35 |
| 3 | 41 |
| 4 | 47 |
| 5 | 55 |
| 6 | 64 |
| 7 | 74 |
| 8 | 86 |
| 9 | 100 |
| 10 | 117 |

---

## 4. Buildings

### 4.1 Cost Formula

```
cost(resource, level) = round5(BASE_COST[resource] × FACTOR^(level - 1))
round5(x) = round(x / 5) × 5
```

### 4.2 Build Time Formula

```
buildTime(level) = BASE_TIME_SECONDS × 1.20^(level - 1) × HQ_FACTOR
HQ_FACTOR = (2/3) × 1.06^(-hqLevel)
```

HQ level reduces construction time for all buildings. Time is calculated at the moment of enqueueing, not at completion.

The server persists a `BuildQueue` entity:
```
{ villageId, buildingType, targetLevel, startedAt, completesAt }
```

Upgrades are applied either by a global background job or on-demand when the village view is loaded.

### 4.3 Building Reference

#### Timber Camp
- **Levels:** 1–10 | **Pop cost (max level):** 35 | **Req HQ:** —
- **Effect:** Produces Wood/hour per formula above.
- **Cost base:** Wood 100 | Clay 80 | Iron 30 | Factor 1.26

#### Clay Pit
- **Levels:** 1–10 | **Pop cost (max level):** 35 | **Req HQ:** —
- **Effect:** Produces Clay/hour per formula above.
- **Cost base:** Wood 80 | Clay 100 | Iron 30 | Factor 1.26

#### Iron Mine
- **Levels:** 1–10 | **Pop cost (max level):** 60 | **Req HQ:** —
- **Effect:** Produces Iron/hour per formula above. Higher pop cost than other extractors (specialized labor).
- **Cost base:** Wood 100 | Clay 60 | Iron 80 | Factor 1.26

#### Headquarters (HQ)
- **Levels:** 1–10 | **Pop cost (max level):** 50 | **Req HQ:** — (always present)
- **Effect:** Reduces build time of all buildings via `HQ_FACTOR`. Unlocks access to other buildings:

| HQ Level | Unlocks |
|---|---|
| 1 | Barracks, Wall, Rally Point |
| 3 | Market |
| 5 | Smithy, Church |
| 7 | Stable (post-MVP) |
| 10 | Watchtower (post-MVP) |

- **Cost base:** Wood 90 | Clay 80 | Iron 70 | Factor 1.30

#### Warehouse
- **Levels:** 1–10 | **Pop cost:** 0 | **Req HQ:** —
- **Effect:** Sets max storage per resource:
  ```
  capacity(level) = round(800 × 1.45^(level - 1))
  ```

| Level | Capacity/resource |
|---|---|
| 1 | 800 |
| 3 | 1,680 |
| 5 | 3,530 |
| 7 | 7,410 |
| 10 | 24,760 |

- **Cost base:** Wood 60 | Clay 80 | Iron 40 | Factor 1.28

#### Farm
- **Levels:** 1–10 | **Pop cost:** 0 (source, not consumer) | **Req HQ:** — (always present)
- **Effect:** Provides total population capacity:
  ```
  capacity(level) = round(240 × 1.33^(level - 1))
  ```

| Level | Max population |
|---|---|
| 1 | 240 |
| 3 | 430 |
| 5 | 760 |
| 7 | 1,340 |
| 10 | 3,150 |

- `populationUsed` is never persisted — always derived on request from all constructed buildings + all living units.
- Cannot be destroyed below level 1.
- **Cost base:** Wood 45 | Clay 40 | Iron 30 | Factor 1.28

#### Market
- **Levels:** 1–10 | **Pop cost (max level):** 25 | **Req HQ:** 3
- **Effect:**
  - Merchants available: `merchants(level) = level × 2` (each carries 1,000 resources)
  - Max active offers: `maxActiveOffers(level) = level`
- **Server entity `MarketOffer`:** `{ id, villageId, offeredResource, offeredAmount, requestedResource, requestedAmount, createdAt, expiresAt }`
- Offered resources are deducted immediately (escrow). Exchange is atomic. Merchants have travel time based on map distance.
- **Cost base:** Wood 100 | Clay 100 | Iron 50 | Factor 1.27

#### Barracks
- **Levels:** 1–10 | **Pop cost (max level):** 60 | **Req HQ:** 1
- **Effect:** Reduces training time for all units:
  ```
  trainTimeFactor(level) = (2/3) × 1.06^(-level)
  ```
- Training is a FIFO queue. Resources deducted on enqueue.
- **Server entity `TrainingQueue`:** `{ id, villageId, unitType, quantity, startedAt, completesAt }`
- **Cost base:** Wood 200 | Clay 170 | Iron 90 | Factor 1.26

#### Smithy
- **Levels:** 1–10 | **Pop cost (max level):** 45 | **Req HQ:** 5, Barracks 1
- **Effect:** Unlocks military technology research. Technologies are per-village (not per-player).
- **Server entity `VillageTechnology`:** `{ villageId, technologyKey, level, researchedAt }`
- Bonuses apply multiplicatively during combat:
  ```
  effectiveAttack = baseAttack × product(1 + bonus for each researched tech)
  ```
- **MVP Technologies:**

| Technology | Req Smithy | Effect | Cost |
|---|---|---|---|
| Iron weapons | 1 | +15% Infantry attack | 120W / 80C / 200I |
| Hardened shields | 2 | +15% Infantry defense | 100W / 100C / 150I |
| Tempered arrows | 3 | +15% Archer attack | 80W / 60C / 180I |
| Reinforced armor | 5 | +10% defense all units | 200W / 150C / 300I |
| Advanced tactics | 7 | +5% attack all units | 300W / 200C / 400I |

- **Cost base:** Wood 220 | Clay 180 | Iron 150 | Factor 1.30

#### Rally Point
- **Levels:** 1 (single level) | **Pop cost:** 5 | **Req HQ:** 1
- **Effect:** Enables sending troops to other villages (attack, support). Shows all active troop movements. Allows cancelling own outgoing troops before arrival.
- **Server entity `TroopMovement`:** `{ id, originVillageId, targetVillageId, units: JSON, type: 'attack'|'support'|'return', departedAt, arrivesAt, status }`
- Travel time:
  ```
  distance = sqrt((x2-x1)² + (y2-y1)²)
  travelTime = distance / slowestUnit.speed
  arrivesAt = departedAt + travelTime
  ```
- **Cost (one-time):** Wood 110 | Clay 100 | Iron 100

#### Wall
- **Levels:** 1–10 | **Pop cost (max level):** 30 | **Req HQ:** 1
- **Effect:** Two stacking combat bonuses for the defender:
  ```
  DEF_wall_fixed = 20 + 50 × wallLevel
  DEF_wall_multiplier = 1.037^wallLevel
  DEF_total = (troopsDEF + DEF_wall_fixed) × DEF_wall_multiplier
  ```

| Wall Level | Fixed bonus | Multiplier |
|---|---|---|
| 0 | 0 | ×1.00 |
| 3 | 170 | ×1.11 |
| 5 | 270 | ×1.20 |
| 10 | 520 | ×1.44 |

- **Cost base:** Wood 50 | Clay 100 | Iron 20 | Factor 1.32

#### Church
- **Levels:** 1–10 | **Pop cost (max level):** 40 | **Req HQ:** 5
- **Effect:**
  - Level 1+: troops from this village fight at 100% (without Church: 50%).
  - Level 3+: influence radius extends to nearby villages of the same player.
  - Level 5+: faith bonus increases attack by +5% per level above 4 (max +20% at level 10).
  ```
  faithMultiplier = hasChurchInfluence(village) ? 1.0 + faithBonus : 0.5
  faithBonus = church.level >= 5 ? min(0.20, (church.level - 4) × 0.05) : 0
  ```
- **Influence radius** (map units):

| Church Level | Radius |
|---|---|
| 1 | 0 (own village only) |
| 3 | 5 |
| 5 | 10 |
| 8 | 15 |
| 10 | 20 |

- Influence is checked at combat resolution. May be cached with short TTL (60s) to avoid per-combat geo queries.
- **Cost base:** Wood 180 | Clay 150 | Iron 80 | Factor 1.30

#### Hiding Place
- **Levels:** 1–5 | **Pop cost (max level):** 15 | **Req HQ:** —
- **Effect:** Protects resources from looting:
  ```
  hiddenCapacity(level) = level × 400   // total across all 3 resources
  ```
- Player can configure how the protected capacity is distributed across resources (default: equal split).
- Hidden resources are still accessible by the owner for construction/training.
- **Cost base:** Wood 50 | Clay 60 | Iron 50 | Factor 1.25

#### Stable *(post-MVP)*
- **Levels:** 1–10 | **Pop cost (max level):** 50 | **Req HQ:** 7, Barracks 5, Smithy 5
- **Effect:** Unlocks Cavalry recruitment. Reduces Cavalry training time like Barracks does for Infantry/Archer.

#### Watchtower *(post-MVP)*
- **Levels:** 1–5 | **Pop cost (max level):** 20 | **Req HQ:** 10, Wall 5
- **Effect:** Detects incoming attacks launched from villages within a radius, tagging them as "known incoming" in the Rally Point.

### 4.4 Building Summary Table

| Building | Levels | Pop (max) | Req HQ | Category |
|---|---|---|---|---|
| Timber Camp | 1–10 | 35 | — | Production |
| Clay Pit | 1–10 | 35 | — | Production |
| Iron Mine | 1–10 | 60 | — | Production |
| Headquarters | 1–10 | 50 | — | Infrastructure |
| Warehouse | 1–10 | 0 | — | Infrastructure |
| Farm | 1–10 | 0 | — | Infrastructure |
| Market | 1–10 | 25 | 3 | Infrastructure |
| Barracks | 1–10 | 60 | 1 | Military |
| Smithy | 1–10 | 45 | 5 | Military |
| Rally Point | 1 | 5 | 1 | Military |
| Stable* | 1–10 | 50 | 7 | Military |
| Wall | 1–10 | 30 | 1 | Defense |
| Church | 1–10 | 40 | 5 | Defense |
| Hiding Place | 1–5 | 15 | — | Defense |
| Watchtower* | 1–5 | 20 | 10 | Defense |

*post-MVP

---

## 5. Population

Population is the **primary scarcity mechanic**. It is not a visible resource — it is a capacity provided by the Farm.

```
populationAvailable = farm.capacity - populationUsed
populationUsed = sum(popCost of each constructed building) + sum(popCost × quantity of each living unit)
```

- `populationUsed` is never stored — always computed on demand.
- Before approving any construction or training: `if (populationUsed + cost > farm.capacity) → reject`.
- Farm cannot go below level 1.

### Population costs per unit

| Unit | Pop per unit |
|---|---|
| Infantry | 1 |
| Archer | 1 |
| Cavalry (post-MVP) | 2 |

---

## 6. Military Units

### 6.1 Unit Stats

| Unit | Attack | Defense | Speed | Carry capacity |
|---|---|---|---|---|
| Infantry | 45 | 20 | — | — |
| Archer | 35 | 40 | — | — |
| Cavalry (post-MVP) | — | — | — | — |

Speed and carry capacity to be specified when map system is defined.

### 6.2 Training

- Trained in Barracks (Infantry, Archer) or Stable (Cavalry, post-MVP).
- FIFO queue. Resources deducted on enqueue. Population reserved on enqueue.
- If Farm capacity is insufficient for the full requested quantity, only train up to the available limit.

---

## 7. Combat

### 7.1 Combat Resolution

**Step 1 — Attacker total strength:**
```
ATK = sum(unit.attack × quantity) × faithMultiplier × moraleMultiplier
```

**Step 2 — Defender total strength:**
```
DEF_base = sum(unit.defense × quantity)
DEF_wall_fixed = 20 + 50 × wallLevel
DEF_wall_mult = 1.037^wallLevel
DEF = (DEF_base + DEF_wall_fixed) × DEF_wall_mult
```

**Step 3 — Luck:**
```
ATK_final = ATK × luck     // luck ∈ [0.85, 1.15], random per battle
```

**Step 4 — Winner determination:**
```
attacker wins if ATK_final > DEF
defender wins if ATK_final ≤ DEF
```

**Step 5 — Casualties (winner loss ratio):**
The loser loses everything. The winner suffers proportional losses:
```
ratio = (loserStrength / winnerStrength)^0.5 / (winnerStrength / loserStrength)
unitsLost_winner = round(totalUnits × ratio)
```

### 7.2 Modifiers

**Faith (Church):**
```
faithMultiplier = hasChurchInfluence(attackingVillage) ? (1.0 + faithBonus) : 0.5
faithBonus = church.level >= 5 ? min(0.20, (church.level - 4) × 0.05) : 0
```

**Morale** (new player protection):
```
moraleMultiplier = clamp(defenderPoints / attackerPoints, 0.30, 1.0)
```

### 7.3 Loot (attacker wins only)

```
hiddenResources[r] = min(village.resources[r], hidingPlace.protectedShare[r])
lootable[r] = max(0, village.resources[r] - hiddenResources[r])
// Warehouse caps: max 50% of capacity is lootable
lootable[r] = min(lootable[r], warehouse.capacity × 0.5)
survivorRatio = survivingAttackers / sentAttackers
actualLoot[r] = lootable[r] × survivorRatio
```

### 7.4 Battle Report (shown to both players)

```
survivingAttackers% = 1 - attackerLossRatio   (if attacker won, else 0)
survivingDefenders% = 1 - defenderLossRatio   (if defender won, else 0)
```

---

## 8. Player Points

Scoring system to be fully specified. Points are used in:
- Morale calculation: `clamp(defenderPoints / attackerPoints, 0.30, 1.0)`

Point calculation formula: **to be specified in next GDD iteration**.

---

## 9. Map

**To be specified in next GDD iteration.** Known constraints:
- Villages have `(x, y)` coordinates.
- Distance formula: `sqrt((x2-x1)² + (y2-y1)²)`
- Church influence radius is expressed in map units.
- Troop travel time depends on map distance and slowest unit speed.
- Market merchant travel time depends on map distance.

---

## 10. MVP Scope

**In scope for MVP:**

- Village management: resources, buildings, population
- All buildings except Stable and Watchtower
- Military units: Infantry, Archer
- Combat system (full formula including luck, faith, morale, wall, loot, hiding place)
- Rally Point: send attacks, view movements, cancel outgoing
- Market: create offers, accept offers, escrow, merchant travel
- Smithy: technology research (5 MVP techs)
- Shared map (basic, 2D grid)
- Player accounts

**Post-MVP (explicitly deferred):**

- Stable + Cavalry
- Watchtower
- Village conquest system (Noble equivalent)
- Full player points formula
- Catapults / ram mechanics
- Tribe / alliance system

---

## 11. Key Design Tensions

1. **Farm is always the bottleneck.** Every building and every unit competes for the same population pool. The player is always choosing.
2. **HQ unlocks the tree.** Skipping HQ upgrades blocks access to Market, Smithy, Church.
3. **Church creates strategic geography.** Villages near a Church (with radius) are more valuable. Map position matters.
4. **Warehouse limits offline growth.** A player who logs off for 24h without expanding Warehouse loses production to overflow. Encourages engagement without being punitive.
5. **Hiding Place maintains attack incentive.** The cap (max 2,000 resources protected) ensures there is always something to gain from attacking, even against a prepared player.
6. **Technologies are per-village.** Conquering a village does not inherit its research. This makes conquest a calculation, not a pure resource grab.
