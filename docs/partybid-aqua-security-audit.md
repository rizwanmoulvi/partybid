# PartyBidAquaApp Security Audit & Specification Freeze

## 1. Contract address
Deployed dynamically in testnet scripts. Current targeted environment: Arc Testnet (`5042002`).

## 2. Source reviewed
`contracts/PartyBidAquaApp.sol`

## 3. Aqua address
Target Arc Testnet Aqua Registry: `0xBf4140CD28b03479aD2F129c382b673101CF442B`

## 4. EIP-712 domain
- **Name:** `PartyBidAquaApp`
- **Version:** `1`
- **Chain ID:** Automatically bound by OpenZeppelin's `EIP712` via `block.chainid`. This ensures signatures generated for Arc Testnet cannot be replayed on Ethereum Mainnet or other testnets.
- **Verifying Contract:** Automatically bound by OpenZeppelin's `EIP712` via `address(this)`. This ensures signatures are bound exclusively to this specific deployed instance of the contract.

## 5. Settlement type
The EIP-712 typehash strictly incorporates:
```solidity
Settlement(bytes32 partyId,bytes32 songRequestId,bytes32 bidId,address maker,bytes32 strategyHash,address token,uint256 amount,bytes32 outcome,address recipient,uint256 nonce,uint256 deadline)
```

## 6. Signature authorization
The `executeSettlement` function verifies that the recovered signer address matches the immutable `settlementSigner` configuration. Any modification to the signed fields or a signature from an unauthorized wallet results in an `Invalid settlement signature` revert.

## 7. Replay model
- **Key:** The fully hashed EIP-712 structured data (`digest`).
- **Protection:** `mapping(bytes32 => bool) public settled` is updated to `true` prior to executing the external `pull`.
- **Effectiveness:** This guarantees that the exact same settlement configuration (with the exact same `nonce`) can only ever be executed once per contract instance per chain.

## 8. Aqua app authorization
The `PartyBidAquaApp` contract directly calls `IAquaRegistry.pull()`. In the Aqua architecture, `pull()` implicitly uses `msg.sender` as the authoritative `app`. This perfectly aligns with our requirement: `PartyBidAquaApp` exclusively pulls funds for which it was explicitly designated as the `app` during `ship()`. An attacker cannot use this contract to pull funds belonging to an unrelated Aqua strategy or app.

## 9. Token authorization
The token is explicitly bound in the `Settlement` typed data and passed to Aqua's `pull()`. This prevents an attacker from switching the withdrawn token. The signer must enforce that the token is `WUSDC` before generating the signature.

## 10. Recipient authorization
The `recipient` is bound in the `Settlement` typed data. The contract executes `IAquaRegistry.pull(..., settlement.recipient)`. A malicious relayer cannot intercept or divert the funds, as modifying the `recipient` field invalidates the EIP-712 signature.

## 11. Maker authorization
The `maker` is bound in the `Settlement` typed data. This prevents an attacker from substituting their own maker address (or another user's maker address) to drain unrelated virtual balances.

## 12. Amount authorization
The exact `amount` to be withdrawn is authorized by the signature. Partial execution is mathematically prevented because the signature bounds the exact numerical value of `amount`. If the authorized amount exceeds the maker's available virtual balance, Aqua's `pull()` will revert internally.

## 13. Outcome authorization
The `outcome` (e.g., `PLAYER_PAYOUT`, `PLATFORM_PAYOUT`) is hashed into the typed data. While the smart contract does not execute disparate logic paths based on this parameter, its inclusion guarantees that the off-chain signer's intended business logic classification is indelibly bound to the execution hash, preventing off-chain state confusion or misattribution.

## 14. Deadline authorization
The contract enforces `require(block.timestamp <= settlement.deadline, "Expired deadline");`. This successfully bounds the temporal validity of the settlement.

## 15. Reentrancy analysis
The contract correctly follows the Checks-Effects-Interactions (CEI) pattern. The replay mapping (`settled[digest] = true;`) is updated *before* the external `IAquaRegistry(aqua).pull()` call. If a malicious ERC-20 token attempts to reenter `executeSettlement` during the physical transfer, the duplicate settlement digest will immediately revert due to the replay guard.

## 16. Attack tests
Verified locally via `contracts/test/PartyBidAquaApp.test.js`:
- Invalid signature (Wrong amount)
- Wrong recipient
- Wrong maker
- Wrong strategyHash
- Wrong token
- Wrong party/request/bid
- Expired authorization
- Wrong signer
- Replay Attack

## 17. Test results
All attack vectors reverted safely as expected.

## 18. Critical findings
None. The architecture is sound.

## 19. Medium findings
None.

## 20. Low findings
- The contract allows any token to be specified in the settlement signature. While the backend signer can easily enforce `token == WUSDC`, the contract itself relies entirely on the signer's off-chain validation.

## 21. Pre-integration hardening
- **WUSDC immutable**: The contract now strictly enforces `require(settlement.token == wusdc, "Invalid token")` on-chain, eliminating the need to trust the signer's off-chain token validation.
- **platformRecipient immutable**: The contract now enforces `require(settlement.recipient == platformRecipient)` whenever `outcome == OUTCOME_PLATFORM_PAYOUT`. This prevents a compromised relayer or a misconfigured signer from routing platform revenue to an arbitrary address.
- **Supported outcome whitelist**: The contract explicitly enforces `require(settlement.outcome == OUTCOME_PLAYER_PAYOUT || settlement.outcome == OUTCOME_PLATFORM_PAYOUT)`. This guarantees only known financial outcomes can ever be processed, preventing arbitrary byte states.
- **New Hardened Contract Address**: `0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071` (The previous address `0xAd8aC976DD1Ff706D0B53EfA316C08BaD35067D7` is now obsolete).

## 22. What is safe today
The entire financial routing architecture: signatures securely authorize exact amounts to exact recipients (with platform routing guaranteed by consensus), replay is physically impossible, and Aqua effectively bridges the off-chain authorization to on-chain execution. The WUSDC token invariant is enforced at the network level.

## 23. What must change before production
The off-chain backend must now be implemented to safely generate these specific EIP-712 signatures in response to finalized MongoDB party state.

## 24. Final verdict
**PASS**
