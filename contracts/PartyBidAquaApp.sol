// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IAquaRegistry {
    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;
}

contract PartyBidAquaApp is EIP712 {
    address public immutable aqua;
    address public immutable settlementSigner;
    address public immutable wusdc;
    address public immutable platformRecipient;

    // Replay protection
    mapping(bytes32 => bool) public settled;

    // Outcomes
    bytes32 public constant OUTCOME_PLAYER_PAYOUT = keccak256("PLAYER_PAYOUT");
    bytes32 public constant OUTCOME_PLATFORM_PAYOUT = keccak256("PLATFORM_PAYOUT");

    // EIP-712 TypeHash
    bytes32 private constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(bytes32 partyId,bytes32 songRequestId,bytes32 bidId,address maker,bytes32 strategyHash,address token,uint256 amount,bytes32 outcome,address recipient,uint256 nonce,uint256 deadline)"
    );

    event SettlementExecuted(
        bytes32 indexed settlementId,
        bytes32 partyId,
        bytes32 songRequestId,
        bytes32 bidId,
        address indexed maker,
        address token,
        uint256 amount,
        bytes32 outcome,
        address indexed recipient
    );

    constructor(
        address _aqua,
        address _settlementSigner,
        address _wusdc,
        address _platformRecipient
    ) EIP712("PartyBidAquaApp", "1") {
        require(_aqua != address(0), "Invalid Aqua");
        require(_settlementSigner != address(0), "Invalid Signer");
        require(_wusdc != address(0), "Invalid WUSDC");
        require(_platformRecipient != address(0), "Invalid Platform Recipient");
        aqua = _aqua;
        settlementSigner = _settlementSigner;
        wusdc = _wusdc;
        platformRecipient = _platformRecipient;
    }

    struct Settlement {
        bytes32 partyId;
        bytes32 songRequestId;
        bytes32 bidId;
        address maker;
        bytes32 strategyHash;
        address token;
        uint256 amount;
        bytes32 outcome;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    function executeSettlement(Settlement calldata settlement, bytes calldata signature) external {
        require(block.timestamp <= settlement.deadline, "Expired deadline");
        
        // Onchain Invariants
        require(settlement.token == wusdc, "Invalid token");
        
        require(
            settlement.outcome == OUTCOME_PLAYER_PAYOUT || settlement.outcome == OUTCOME_PLATFORM_PAYOUT,
            "Unsupported outcome"
        );
        
        if (settlement.outcome == OUTCOME_PLATFORM_PAYOUT) {
            require(settlement.recipient == platformRecipient, "Invalid platform recipient");
        }

        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                settlement.partyId,
                settlement.songRequestId,
                settlement.bidId,
                settlement.maker,
                settlement.strategyHash,
                settlement.token,
                settlement.amount,
                settlement.outcome,
                settlement.recipient,
                settlement.nonce,
                settlement.deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        require(!settled[digest], "Settlement already executed");
        
        address signer = ECDSA.recover(digest, signature);
        require(signer == settlementSigner, "Invalid settlement signature");

        // Mark as settled for replay protection
        settled[digest] = true;

        // Execute pull physically allocating funds to the designated recipient
        IAquaRegistry(aqua).pull(
            settlement.maker,
            settlement.strategyHash,
            settlement.token,
            settlement.amount,
            settlement.recipient
        );

        emit SettlementExecuted(
            digest,
            settlement.partyId,
            settlement.songRequestId,
            settlement.bidId,
            settlement.maker,
            settlement.token,
            settlement.amount,
            settlement.outcome,
            settlement.recipient
        );
    }
}
