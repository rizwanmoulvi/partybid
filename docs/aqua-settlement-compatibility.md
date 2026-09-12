# Aqua Settlement Compatibility

## EXECUTESETTLEMENT() → AQUA.PULL() CALL PATH

The deployed `PartyBidAquaApp` (`0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071`) executes the following path when `executeSettlement()` is invoked:

1. **Deadline Validation**: `require(block.timestamp <= settlement.deadline, "Expired deadline");`
2. **Token Validation**: `require(settlement.token == wusdc, "Invalid token");`
3. **Outcome Validation**: Ensures the `outcome` is either `PLAYER_PAYOUT` or `PLATFORM_PAYOUT`.
4. **Recipient Validation**: If `PLATFORM_PAYOUT`, ensures `recipient` equals the `platformRecipient`.
5. **EIP-712 Digest Creation**: Hashes the struct matching the `SETTLEMENT_TYPEHASH` alongside the `PartyBidAquaApp` domain hash.
6. **Replay Validation**: `require(!settled[digest], "Settlement already executed");`
7. **Signature Recovery**: `ECDSA.recover(digest, signature)` must strictly equal the immutable `settlementSigner`.
8. **State Modification**: `settled[digest] = true;` marks the signature as consumed.
9. **Aqua Pull Invocation**:
   ```solidity
   IAquaRegistry(aqua).pull(
       settlement.maker,
       settlement.strategyHash,
       settlement.token,
       settlement.amount,
       settlement.recipient
   );
   ```
10. **Event Emission**: `emit SettlementExecuted(...)`

The path natively enforces that the `maker`, `strategyHash`, `token`, and `amount` embedded in the signature explicitly correlate to the virtual Aqua accounting slot registered by `ship()`. 
Since both backend and frontend securely encode `uint256(keccak256(bidId))` inside `strategyBytes`, the `strategyHash` generated guarantees exact targeting of the slot without collision.
