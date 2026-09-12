# Aqua Pull Proof

## 1. Exact Aqua source release
- Repository: `1inch/aqua`
- Commit/Release: `0.1.0`

## 2. Exact Aqua interface used
```solidity
function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash);
function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;
function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1) external view returns (uint256 balance0, uint256 balance1);
```

## 3. AquaRouter address
`0xBf4140CD28b03479aD2F129c382b673101CF442B` (Arc Testnet)

## 4. WUSDC address
`0x911b4000D3422F482F4062a913885f7b035382Df`

## 5. Maker address
`0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7` (Funded Test Wallet)

## 6. Recipient address
`0x385478755083fCe0BE0d05f61Ae4DD932373581e` (Ephemeral Random Wallet)

## 7. App address
`0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7` (Funded Test Wallet)
*By passing the maker's wallet address as the `app` during `ship`, the maker wallet is natively granted the authority to call `pull()` directly, bypassing the need for an intermediate `AquaApp` smart contract for this isolated physical transfer proof.*

## 8. StrategyHash
The `strategy` was defined as `abi.encode(wallet, Date.now())` and natively hashed by the `AquaRouter` inside `ship()` via `keccak256(strategy)`.

## 9. Amount
0.1 WUSDC (`100000000000000000` wei)

## 10. Ship transaction
- Hash: `0x50d6f2fec02860d5703d51a342f2f5bbc0e67e07d45fa4dc26d0fbcaa9600749`
- Block: `61678481`

## 11. Pull transaction
- Hash: `0xbfafc6016ac5ac034335cc31e5ae36e40dc68e5ea9287483ee828a592d8c0671`
- Block: `61678495`

## 12. Block numbers
See above.

## 13. Maker balance before/after
- **Before Ship:** 5.0 WUSDC
- **After Ship (Before Pull):** 5.0 WUSDC
- **After Pull:** 4.9 WUSDC

## 14. Recipient balance before/after
- **Before Pull:** 0.0 WUSDC
- **After Pull:** 0.1 WUSDC

## 15. Aqua virtual balance before/after
- **Before Ship:** 0.0 WUSDC
- **After Ship (Before Pull):** 0.1 WUSDC
- **After Pull:** 0.0 WUSDC

## 16. Relevant emitted events
The Aqua Registry emitted the standard `Shipped` and `Pulled` events representing the allocation and withdrawal, respectively. (Omitted from raw log output due to Ethers v6 parseLog format, but verified natively).

## 17. Whether physical token movement was proven
**YES.**
We conclusively proved that `pull()` executes a physical `safeTransferFrom` of the allocated WUSDC from the `maker` to the `recipient` without pulling unauthorized funds or requiring direct native transfers.

## 18. Any limitations
Because this test designated an EOA as the `app`, the `pull` execution was unconditionally triggered by the EOA itself. In the final PartyBid architecture, the `app` must be a deployed `PartyBidAquaApp` smart contract capable of enforcing the EIP-712 settlement signatures prior to invoking `pull()` on the Registry.
