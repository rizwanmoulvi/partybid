# Aqua Deployment Plan

## Dependency Graph
1. **AquaRouter** (from `1inch/aqua` repository `release/0.1.0`)
   - **Source Path:** `1inch-aqua/src/AquaRouter.sol`
   - **Why it is required:** This is the core "Aqua Registry". It inherits `Aqua`, `Simulator`, and `Multicall`. It is the central authority that maintains virtual balances and implements `ship`, `dock`, `push`, and `pull`.
   - **Constructor Arguments:** None.
   - **Deployment Dependency:** None.
   - **Required for:** `ship`, `dock`, `pull`.
   - **Official 1inch Code:** Yes.

2. **AquaSwapVMRouter** (from `1inch/swap-vm` repository `release/1.0.2`)
   - **Source Path:** `1inch-swap-vm/src/routers/AquaSwapVMRouter.sol`
   - **Why it is required:** Although PartyBid primarily interacts with the Aqua Registry for the `ship/pull/dock` flow, the official SwapVM infrastructure provides standardized swap execution functionality natively coupled with Aqua constraints. Deploying the Router establishes the complete 1inch execution stack required for robust test coverage and aligns with the expected baseline environment.
   - **Constructor Arguments:** `aqua` (address), `weth` (address), `owner` (address), `name` (string), `version` (string).
   - **Deployment Dependency:** Requires `AquaRouter` to be deployed first.
   - **Required for:** SwapVM execution.
   - **Official 1inch Code:** Yes.

3. **WETH (Mock / Native Wrapper)**
   - **Source Path:** N/A (Already deployed by Arc Network).
   - **Why it is EXCLUDED:** Arc Testnet natively provides `WUSDC` (`0x911b4000D3422F482F4062a913885f7b035382Df`), which serves as the WETH equivalent (wrapping the native gas token). Since we are excluding SwapVM (which requires a WETH reference for unwrapping native gas swaps), we do not need to register or deploy any WETH wrappers.

## Minimum Required Deployments
The absolute minimum deployment graph to prove the PartyBid settlement physics (`ship`, `pull`, `dock`) securely is just **`AquaRouter.sol`**. 

## Constructor Parameters
- `AquaRouter`: No constructor parameters.

## Conclusion
We will exclusively deploy `AquaRouter.sol` to Arc Testnet. This provides 100% of the virtual accounting primitive PartyBid requires without bloating the environment with AMM routing infrastructure.
