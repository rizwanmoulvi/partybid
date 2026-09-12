# PartyBid

> **Bid for priority. Let the DJ play. Let the crowd decide where the money goes.**

PartyBid is a social music marketplace where people at a party can bid on songs using **WUSDC**.

Guests request songs and attach bids. Higher bids get higher priority in the queue, but a bid never guarantees that the song will be played. The DJ controls playback, and after a song is played, the crowd decides what happens to the bid.

If the crowd likes the song, the bidder's committed funds are paid to the player/requester.

If the crowd doesn't like it, the funds go to the PartyBid platform.

If the DJ skips the song, the bidder's commitment is released.

Under the hood, PartyBid uses **1inch Aqua** to create conditional, shared-liquidity commitments and settles them on **Arc Testnet**.

---

## How It Works

```text
                    ┌─────────────────┐
                    │   Guest joins   │
                    │      party      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Request a song  │
                    │ + place WUSDC   │
                    │      bid        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Aqua commitment │
                    │   is created    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  DJ controls    │
                    │    playback     │
                    └────┬────┬───────┘
                         │    │
                  Played │    │ Skipped
                         │    │
                         ▼    ▼
                  ┌─────────┐ ┌─────────┐
                  │ Crowd   │ │  Aqua   │
                  │  votes  │ │  dock   │
                  └────┬────┘ └────┬────┘
                       │             │
             ┌─────────┴─────────┐   │
             │                   │   │
          LIKED              NOT LIKED│
             │                   │   │
             ▼                   ▼   ▼
       Player payout       Platform   Release
                           payout
```

### The core rule

**The bid buys priority, not a guarantee.**

The DJ still decides what gets played.

The crowd decides the economic outcome after playback.

---

## Why PartyBid?

Traditional music requests at parties are:

> "Play this song!"

PartyBid turns that into a market:

> "I'll put $5 behind this song."

That creates an interesting social dynamic:

* Guests compete for queue priority.
* Higher bids increase the chance of getting played sooner.
* DJs retain control of the party.
* The crowd determines whether a song deserves its payout.
* Unplayed/skipped requests don't permanently lose the bidder's funds.
* Settlement happens on-chain rather than through a simulated balance.

---

## Settlement Rules

| Event                                       | Result                                         |
| ------------------------------------------- | ---------------------------------------------- |
| Song receives strict **LIKED majority**     | Bidder/requester receives the committed WUSDC  |
| Song receives strict **NOT_LIKED majority** | PartyBid platform receives the committed WUSDC |
| DJ skips song                               | Aqua commitment is released                    |
| Votes are tied                              | No settlement yet                              |
| One vote vs zero votes                      | The single vote is sufficient for a majority   |
| Higher bid                                  | Higher queue priority                          |

There is **no minimum vote requirement**.

For example:

```text
LIKED       5
NOT_LIKED   2

→ LIKED majority
→ Player payout
```

But:

```text
LIKED       3
NOT_LIKED   3

→ Tie
→ No settlement
```

---

# Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                       PartyBid App                        │
│                                                          │
│  Next.js + React + Tailwind + PWA                       │
│                                                          │
│  Guest UI       DJ UI       Wallet/Profile              │
└───────────────┬───────────────────────┬──────────────────┘
                │                       │
                ▼                       ▼
        ┌──────────────┐       ┌─────────────────┐
        │ Privy        │       │ MongoDB Atlas   │
        │ Auth + Wallet│       │ Application     │
        └──────┬───────┘       │ State           │
               │               └────────┬────────┘
               │                        │
               └────────────┬───────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │ PartyBid Backend    │
                  │                     │
                  │ Auth verification   │
                  │ Bid validation      │
                  │ Vote resolution     │
                  │ Settlement signing  │
                  │ Receipt verification│
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │    Arc Testnet      │
                  │                     │
                  │ WUSDC               │
                  │ 1inch Aqua          │
                  │ PartyBidAquaApp     │
                  └─────────────────────┘
```

## Financial Architecture

MongoDB **never holds or custodies user funds**.

The database stores application state such as:

* parties
* party members
* song requests
* bid metadata
* votes
* settlement status
* transaction hashes

The actual WUSDC commitment exists through Aqua on-chain.

The settlement flow is:

```text
User wallet
    │
    │ WUSDC
    ▼
1inch Aqua
    │
    │ conditional commitment
    ▼
PartyBidAquaApp
    │
    ├── Player payout
    │
    ├── Platform payout
    │
    └── Release / dock
```

---

# 1inch Aqua

PartyBid uses **1inch Aqua** as the commitment layer for song bids.

Instead of transferring WUSDC directly into a centralized PartyBid balance, a guest creates an on-chain Aqua position associated with:

```text
maker
+
PartyBidAquaApp
+
strategyHash
+
WUSDC
```

The backend verifies that the expected Aqua position actually exists before authorizing settlement.

This gives PartyBid a blockchain-native lifecycle:

```text
Bid
 ↓
Aqua commitment
 ↓
DJ decision
 ↓
Crowd decision
 ↓
Conditional settlement
```

---

# Settlement Security

PartyBid uses server-authorized EIP-712 settlement messages.

The settlement authorization includes the relevant party/song/bid information and is verified by the on-chain `PartyBidAquaApp`.

Important security properties include:

* Maker is derived server-side.
* Recipient is derived server-side.
* Strategy hash is regenerated server-side.
* Aqua balance is checked before authorization.
* Settlement deadlines are enforced.
* Contract-level replay protection is used.
* MongoDB is updated only after on-chain confirmation.
* Transaction receipts are independently verified by the backend.
* Duplicate confirmations are idempotent.
* Conflicting transaction hashes are rejected.

The platform recipient is also enforced by the settlement contract.

---

# Technology Stack

### Frontend

* Next.js 16
* React
* JavaScript
* Tailwind CSS v4
* `@serwist/next`
* PWA

### Authentication & Wallet

* Privy
* Embedded wallets

### Backend

* Next.js API routes
* Node.js
* MongoDB Atlas
* Ethers

### Blockchain

* Arc Testnet
* Solidity
* 1inch Aqua
* WUSDC

### Music

* iTunes Search API

---

# Smart Contracts

### Arc Testnet

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| Aqua             | `0xBf4140CD28b03479aD2F129c382b673101CF442B` |
| AquaSwapVMRouter | `0x0515b995bAC26a82C4dA22B3D6EBBA36f95F9EC3` |
| WUSDC            | `0x911b4000D3422F482F4062a913885f7b035382Df` |
| PartyBidAquaApp  | `0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071` |

**Chain ID:** `5042002`

**Network:** Arc Testnet

---

# Data Model

### Party

```js
{
  id,
  name,
  djUserId,
  status,
  createdAt
}
```

Party lifecycle:

```text
CREATED → LIVE → ENDED
```

### Party Member

```js
{
  partyId,
  privyUserId,
  role: "DJ" | "GUEST",
  walletAddress,
  joinedAt
}
```

### Song Request

```js
{
  id,
  partyId,
  userId,
  songId,
  title,
  artist,
  album,
  artworkUrl,
  durationMs,
  status,
  createdAt,
  updatedAt
}
```

Song lifecycle:

```text
REQUESTED
    │
    ▼
 PLAYING
    │
    ▼
 PLAYED
    │
    ▼
 VOTING
    │
    ├── LIKED ────────► RESOLVED
    │
    ├── NOT_LIKED ────► RESOLVED
    │
    └── SKIP ─────────► RELEASED
```

### Bid

A bid stores the metadata necessary to identify its Aqua commitment:

```js
{
  id,
  partyId,
  songRequestId,
  userId,
  amount,
  status,
  maker,
  strategyHash,
  shipTransactionHash,
  chainId,
  token,
  createdAt,
  updatedAt
}
```

---

# Running Locally

## Prerequisites

You need:

* Node.js
* npm
* MongoDB Atlas database
* Privy application
* Arc Testnet wallet
* Arc Testnet WUSDC
* required environment variables

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build the application:

```bash
npm run build
```

Run tests:

```bash
npm test
```

---

# Environment Variables

Create a `.env.local` file containing the required application configuration.

Example:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=partybid

ARC_RPC_URL=https://rpc.testnet.arc.network

AQUA_ADDRESS=0xBf4140CD28b03479aD2F129c382b673101CF442B
AQUA_SWAP_VM_ROUTER_ADDRESS=0x0515b995bAC26a82C4dA22B3D6EBBA36f95F9EC3
WUSDC_ADDRESS=0x911b4000D3422F482F4062a913885f7b035382Df

PARTYBID_AQUA_APP_ADDRESS=0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071

PLATFORM_RECIPIENT=your_platform_recipient

SETTLEMENT_SIGNER_PRIVATE_KEY=your_server_signer_key
```

**Never commit private keys or secrets to Git.**

---

# Testing

PartyBid includes automated tests for the financial and settlement logic.

The test suite covers areas including:

* majority resolution
* tie handling
* deterministic Aqua strategies
* amount conversion
* settlement routing
* maker validation
* amount spoofing prevention
* idempotency
* Aqua release behavior
* payout outcome routing

The real financial flow has also been manually verified against Arc Testnet using Privy wallets and actual WUSDC transactions.

---

# Security Model

PartyBid follows a **blockchain-first settlement model**.

The frontend is not trusted for financial authorization.

For example, a client cannot simply submit:

```js
{
  amount: "1000",
  recipient: "attacker",
  maker: "attacker"
}
```

and have the server blindly authorize it.

Instead, the backend derives critical information from authenticated application state and verifies the corresponding on-chain Aqua position.

The settlement contract additionally enforces the permitted outcomes and configured platform recipient.

---

# Current Status

### Core Protocol

* [x] Party creation
* [x] Party membership
* [x] Song search
* [x] Song requests
* [x] Bid queue
* [x] Real Aqua commitments
* [x] DJ play/skip flow
* [x] Crowd voting
* [x] Majority resolution
* [x] Aqua release on skip
* [x] Player payout
* [x] Platform payout
* [x] On-chain settlement verification
* [x] Replay protection
* [x] Settlement history
* [x] Wallet/profile experience

### Infrastructure

* [x] Privy authentication
* [x] Embedded wallets
* [x] MongoDB Atlas
* [x] Arc Testnet
* [x] 1inch Aqua
* [x] PartyBidAquaApp
* [x] EIP-712 authorization

### Planned / Product Polish

* [ ] Full production music playback experience
* [ ] Real-time party state updates
* [ ] Advanced DJ experience
* [ ] Additional analytics
* [ ] Mainnet deployment

---

# Project Philosophy

PartyBid is intentionally designed around a simple principle:

> **Blockchain should enforce the economic rules without making the party feel like a blockchain application.**

Guests shouldn't need to understand Aqua, EIP-712, smart contracts, or transaction receipts.

They should simply experience:

```text
Pick a song
    ↓
Place a bid
    ↓
Wait for the DJ
    ↓
Listen
    ↓
Vote
    ↓
See what happened to your money
```

The blockchain infrastructure exists underneath that experience to make the commitment and settlement transparent and verifiable.

---

# Hackathon

PartyBid was built for **ETHGlobal ETHOnline 2026**.

The project explores how programmable liquidity can be used for a social, consumer-facing application rather than another trading interface.

The central idea is:

> **What if a party's music queue became a market, while the crowd became the settlement mechanism?**

---


