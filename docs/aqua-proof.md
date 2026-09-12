# Aqua Integration Proof & Requirements

## Protocol Mechanics Discovered
After analyzing the official `@1inch/aqua-sdk` and protocol architecture, Aqua operates on a "virtual balance" and "strategy" paradigm managed by an external integration contract known as an **AquaApp**.

1. **What does PartyBid call an "Aqua commitment"?**
   An Aqua commitment (in PartyBid) corresponds to depositing USDC into Aqua's virtual balances (via `aqua.ship`), tagged with a `strategyHash` unique to the specific user's bid and the PartyBid AquaApp.

2. **What exact on-chain action creates it?**
   The maker (guest placing the bid) must execute the `ship()` transaction on the core Aqua Registry (`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`). This creates a virtual balance/accounting. It does NOT transfer USDC.

3. **What exact on-chain action removes it when a song is skipped?**
   The maker executes the `dock()` transaction on the Aqua Registry, referencing the same `strategyHash`. This removes the virtual balance. It does NOT transfer USDC.

4. **What exact on-chain action executes a LIKED payout?**
   A "Taker" (which can be anyone, but typically a decentralized solver, the DJ, or the requester themselves) submits an execution transaction to the custom PartyBid AquaApp. The App triggers Aqua's `pull()` to perform the actual token transfer from the maker's wallet to the requester.

5. **What exact on-chain action executes a NOT_LIKED payout?**
   Similar to the LIKED payout, a Fill transaction is submitted to the Router, but the PartyBid AquaApp logic routes the virtual balance to the Platform treasury address instead.

6. **Which wallet signs each action?**
   - **Ship (Deposit):** The guest placing the bid.
   - **Dock (Withdraw/Skip):** The guest who placed the bid.
   - **Execute (Payout):** Any Taker wallet (to initiate the SwapVM routing). The maker's signature is implicit in the deployed strategy structure.

7. **Which transaction actually moves USDC?**
   The `ship()` and `dock()` transactions only manipulate virtual balances. The Execute transaction (triggered by a Taker) is the only transaction that actually moves physical USDC via Aqua's `pull()` function.

8. **What transaction/hash should MongoDB store?**
   MongoDB should store the `strategyHash` (which uniquely identifies the bid position on-chain), alongside the `ship` transaction hash to verify the commitment was funded. When executed or docked, the resulting transaction hash should be stored to mark the settlement `COMPLETED`.

9. **What happens if a transaction fails?**
   The virtual balances remain untouched. The state remains resolvable until a successful `dock` or execution.

10. **How can the backend verify settlement completion?**
    The backend can listen to `DockedEvent` (for skips) or `PulledEvent` (for execution) emitted by the Aqua Registry, indexing them by the `strategyHash`.

11. **Can the same commitment be executed twice?**
    No, execution logic in the AquaApp consumes the virtual balances. Once consumed, the `strategyHash` holds a zero balance.

12. **How does Aqua prevent double execution?**
    Virtual balances are atomic. If a strategy's virtual balance is drained by the first execution, a subsequent execution will revert due to insufficient virtual balance.

13. **What information must PartyBid store for each bid?**
    - The maker's address
    - The exact parameters required to encode the PartyBid `strategy` struct
    - The `strategyHash`
    - The `ship` transaction hash

---

## STOP CONDITION REACHED: Missing Component

Per the project directives, I am stopping the integration proof because a critical component is missing: **The PartyBid AquaApp Smart Contract**.

According to the official `@1inch/aqua-sdk`:
> *"Each Aqua app can have its own strategy schema. Encode strategy as bytes based on the smart contract app structure."*

Because we do not yet have a PartyBid-specific AquaApp deployed on the Arc Testnet:
1. **Unknown Strategy Encoding:** We cannot encode the `strategy` struct because we don't know the exact schema PartyBid will use (e.g., how we encode the song ID, the party ID, and the outcome conditions).
2. **Unknown Execution Mechanism:** We cannot execute a swap/fill because execution requires routing through the specific AquaApp contract logic to validate the state and release the virtual balances.

**Required Next Step:**
A Solidity developer must design, write, and deploy the PartyBid AquaApp to the Arc Testnet. This contract must define the custom Strategy struct for song bids and implement the SwapVM resolution logic. Once deployed, we can encode the strategy exactly as required and finalize this integration proof.
