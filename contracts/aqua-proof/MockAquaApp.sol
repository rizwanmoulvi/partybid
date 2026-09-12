// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAquaRegistry {
    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address recipient) external;
    function push(address maker, bytes32 strategyHash, address token, uint256 amount) external;
}

contract MockAquaApp {
    IAquaRegistry public immutable registry;

    constructor(address _registry) {
        registry = IAquaRegistry(_registry);
    }

    // A minimal function to trigger a pull from the Aqua Registry.
    // In a real app, this would verify EIP-712 signatures, outcome states, and ensure
    // the caller is authorized. Here we just expose it to prove Aqua mechanics.
    function executePull(
        address maker,
        bytes32 strategyHash,
        address token,
        uint256 amount,
        address recipient
    ) external {
        registry.pull(maker, strategyHash, token, amount, recipient);
    }
}
