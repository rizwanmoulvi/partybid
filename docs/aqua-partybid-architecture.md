# Aqua + PartyBid Architecture Analysis

## 1. Aqua Facts Verified
From official 1inch Aqua and SwapVM documentation:
- **`ship()`**: Creates a virtual balance in the Aqua protocol accounting system. It does NOT transfer ERC20 tokens.
- **`dock()`**: Reverses a `ship()`. It removes the virtual balance. It does NOT transfer ERC20 tokens.
- **`pull()`**: Actual token transfer from maker wallet during execution.
- **`push()`**: Actual token transfer into maker strategy during execution.

## 2. Option A Analysis: SwapVM Existing Opcodes
**Findings:** Cannot express PartyBid conditional escrow natively.
**Reason:** SwapVM's native instruction set (`xycSwap`, `limitSwap`, `dutchAuction`, `twapSwap`, etc.) is strictly designed for two-sided token exchanges (AMMs) governed by mathematical pricing curves or time decays. There is no native opcode capable of verifying an off-chain song voting result, nor is there an instruction for a purely conditional one-sided escrow transfer that dynamically alters the payout recipient based on a boolean outcome.

## 3. Option B Analysis: Extruction
**Findings:** Technically possible but architecturally inappropriate.
**Reason:** The `extruction` opcode allows SwapVM to pause and invoke an external smart contract for custom logic. An Extruction contract could theoretically take the strategy hash, verify the condition (e.g. via ECDSA), and return a quote to pull the USDC. However, SwapVM is a heavy routing engine for trading. Using it just to trigger an `extruction` that executes a 1-sided escrow payout misuses the protocol. The Extruction contract would also strictly need to be **non-upgradeable** so makers can trust it won't be altered to steal funds post-commitment.

## 4. Option C Analysis: Custom AquaApp
**Findings:** The ideal architecture.
**Reason:** Aqua allows custom integrators to build independent `AquaApp` smart contracts that manage their own strategies. A custom AquaApp allows us to define the exact struct needed for a bid, securely execute `pull()` based on our own signature verification, and directly execute the one-sided transfer. 

## 5. Recommended Architecture
**Custom AquaApp with Backend EIP-712 Attestations.**

## 6. Exact Reason for Recommendation
It is the most gas-efficient, secure, and native way to integrate with Aqua for non-AMM use cases. It completely isolates PartyBid's logic from unrelated decentralized exchange routing, while strictly maintaining the non-custodial guarantee.

## 7. Strategy Fields Required
The custom `strategy` struct bound to the AquaApp must include:
- `maker` (address): The guest committing the bid.
- `token` (address): Arc Testnet USDC.
- `amount` (uint256): The exact bid amount.
- `partyId` (string/bytes32): To uniquely identify the context.
- `songRequestId` (string/bytes32): To uniquely identify the song.
- `requester` (address): The wallet of the user who requested the song (for LIKED payouts).
- `salt` (bytes32): Crucial for **replay protection**, ensuring multiple bids from the same maker on the same song are uniquely hashed.

*Note: The platform recipient does not need to be in the strategy if it is a globally immutable variable set on the AquaApp contract itself.*

## 8. How Skip Works
The guest (maker) calls `aqua.dock(strategyHash)`. The Aqua Registry instantly destroys the virtual balance. No physical USDC was ever moved, and the maker's wallet retains full custody. No backend interaction is required.

## 9. How Liked Payout Works
A Taker (e.g., the requester or a relayer) calls a custom `execute(strategy, outcome, backendSignature)` function on the PartyBid AquaApp. The App verifies the backend's signature matches the `strategyHash` and `outcome == LIKED`. It then calls Aqua's `pull()` to move physical USDC from the maker to the `requester` address encoded in the strategy, consuming the virtual balance.

## 10. How Not-Liked Payout Works
The same as LIKED, but the App verifies the signature states `outcome == NOT_LIKED`. The App then routes the pulled physical USDC to the immutable Platform Treasury address.

## 11. How Majority Result Becomes Authoritative
**Architecture C (Backend signs an authorization)** is the most robust:
- **Who can authorize:** The PartyBid backend signs an EIP-712 payload: `(strategyHash, outcome)`. 
- **How a malicious backend could abuse it:** A compromised backend could sign a fake outcome (e.g., marking a LIKED song as NOT_LIKED). However, it **cannot steal the funds** because the payout recipients (Requester or Platform) are hardcoded into the contract and the immutable strategy hash.
- **Complexity:** Low. Simply requires an `ecrecover` in the AquaApp.

*(Other evaluated architectures like purely on-chain voting or Oracle ingestion are far too complex and costly for a localized party app).*

## 12. Replay Protection
A `salt` field in the strategy ensures every `strategyHash` is globally unique. An execution completely consumes the exact virtual balances of that specific `strategyHash`.

## 13. Double-Settlement Protection
Aqua prevents double execution natively. When the AquaApp executes, it verifies the virtual balance. If a second transaction attempts to execute the same strategy, the Aqua Registry will revert because the virtual balance for that `strategyHash` was already drained in the first execution.

## 14. Backend Custody Analysis
**Can PartyBid safely do this WITHOUT giving the backend custody of guest funds?**
**YES, explicitly.** 
Guest ships virtual USDC. The backend only holds a key capable of signing `(strategyHash, outcome)`. When the smart contract verifies this signature, it rigidly routes the funds according to the immutable strategy parameters established by the guest at the time of `ship()`. The backend literally cannot sign a transaction that routes funds to an arbitrary attacker's wallet. PartyBid remains 100% non-custodial.

## 15. Exact Contracts That Would Eventually Need to Exist
- `PartyBidAquaApp.sol`: A custom smart contract deployed to Arc Testnet that implements the strategy schema, the EIP-712 signature verification, and the Aqua `pull()` / transfer callbacks.

## 16. Exact Next Implementation Step
Write and deploy `PartyBidAquaApp.sol` to the Arc Testnet to formalize the custom execution routing.
