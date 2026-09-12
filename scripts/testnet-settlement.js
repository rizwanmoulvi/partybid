import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);
    const recipient = ethers.Wallet.createRandom().address;

    const aquaRegistryAddress = process.env.NEXT_PUBLIC_AQUA_REGISTRY;
    const wusdcAddress = process.env.NEXT_PUBLIC_WUSDC;
    const appAddress = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP;

    const aquaAbi = [
        "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)",
        "function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)",
    ];
    
    const wusdcAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function decimals() view returns (uint8)"
    ];

    const appArtifact = JSON.parse(fs.readFileSync('out/PartyBidAquaApp.sol/PartyBidAquaApp.json', 'utf8'));
    const app = new ethers.Contract(appAddress, appArtifact.abi, wallet);
    const aqua = new ethers.Contract(aquaRegistryAddress, aquaAbi, wallet);
    const wusdc = new ethers.Contract(wusdcAddress, wusdcAbi, wallet);

    const testAmount = ethers.parseUnits("0.1", 18);

    console.log(`[1] Environment`);
    console.log(`    Maker: ${wallet.address}`);
    console.log(`    Recipient: ${recipient}`);
    console.log(`    App: ${appAddress}`);

    // Ensure allowance for Aqua Router
    const allowance = await wusdc.allowance(wallet.address, aquaRegistryAddress);
    if (allowance < testAmount) {
        console.log(`[2] Approving WUSDC to Aqua Registry...`);
        const txApprove = await wusdc.approve(aquaRegistryAddress, ethers.MaxUint256);
        await txApprove.wait();
    } else {
        console.log(`[2] WUSDC allowance sufficient.`);
    }

    const domain = {
        name: "PartyBidAquaApp",
        version: "1",
        chainId: (await provider.getNetwork()).chainId,
        verifyingContract: appAddress
    };

    const types = {
        Settlement: [
            { name: "partyId", type: "bytes32" },
            { name: "songRequestId", type: "bytes32" },
            { name: "bidId", type: "bytes32" },
            { name: "maker", type: "address" },
            { name: "strategyHash", type: "bytes32" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "outcome", type: "bytes32" },
            { name: "recipient", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    // Strategy bytes logic (using a deterministic hash)
    const strategyBytes = ethers.solidityPacked(["address", "uint256"], [wallet.address, Date.now()]);
    const strategyHash = ethers.keccak256(strategyBytes);

    const settlement = {
        partyId: ethers.id("party_real_1"),
        songRequestId: ethers.id("req_real_1"),
        bidId: ethers.id("bid_real_1"),
        maker: wallet.address,
        strategyHash: strategyHash,
        token: wusdcAddress,
        amount: testAmount,
        outcome: ethers.id("PLAYER_PAYOUT"),
        recipient: recipient,
        nonce: 1,
        deadline: Math.floor(Date.now() / 1000) + 3600
    };

    const signature = await wallet.signTypedData(domain, types, settlement);

    const preMaker = await wusdc.balanceOf(wallet.address);
    const preRecip = await wusdc.balanceOf(recipient);
    console.log(`\n[3] Pre-Ship`);
    console.log(`    Maker: ${ethers.formatUnits(preMaker, 18)}`);
    console.log(`    Recip: ${ethers.formatUnits(preRecip, 18)}`);

    console.log(`\n[4] Executing ship(PartyBidAquaApp)`);
    const txShip = await aqua.ship(appAddress, strategyBytes, [wusdcAddress], [testAmount]);
    const rxShip = await txShip.wait();
    console.log(`    Tx: ${txShip.hash}`);

    const midMaker = await wusdc.balanceOf(wallet.address);
    const [virtualBal] = await aqua.safeBalances(wallet.address, appAddress, strategyHash, wusdcAddress, wusdcAddress);
    console.log(`\n[5] Post-Ship / Pre-Settlement`);
    console.log(`    Maker: ${ethers.formatUnits(midMaker, 18)}`);
    console.log(`    Virtual: ${ethers.formatUnits(virtualBal, 18)}`);

    console.log(`\n[6] Executing PartyBidAquaApp.executeSettlement()`);
    const txSettle = await app.executeSettlement(settlement, signature);
    const rxSettle = await txSettle.wait();
    console.log(`    Tx: ${txSettle.hash}`);
    console.log(`    Block: ${rxSettle.blockNumber}`);

    const postMaker = await wusdc.balanceOf(wallet.address);
    const postRecip = await wusdc.balanceOf(recipient);
    
    // safeBalances reverts if 0 balance, so wrap in try/catch
    let postVirtualBal = 0n;
    try {
        const [vBal] = await aqua.safeBalances(wallet.address, appAddress, strategyHash, wusdcAddress, wusdcAddress);
        postVirtualBal = vBal;
    } catch(e) {}

    console.log(`\n[7] Post-Settlement`);
    console.log(`    Maker: ${ethers.formatUnits(postMaker, 18)}`);
    console.log(`    Recip: ${ethers.formatUnits(postRecip, 18)}`);
    console.log(`    Virtual: ${ethers.formatUnits(postVirtualBal, 18)}`);

    if (postRecip === testAmount && preMaker - postMaker === testAmount) {
        console.log(`\n✅ SUCCESS: PartyBidAquaApp successfully pulled funds to recipient!`);
    } else {
        console.log(`\n❌ FAILURE: Balances do not match expectations.`);
    }

    // Attempt replay attack
    console.log(`\n[8] Security: Replay Attack Test`);
    try {
        const txReplay = await app.executeSettlement(settlement, signature);
        await txReplay.wait();
        console.log(`❌ FAILURE: Replay succeeded!`);
    } catch(e) {
        if (e.message.includes("Settlement already executed") || (e.data && e.data.message && e.data.message.includes("Settlement already executed")) || e.message.includes("transaction execution reverted")) {
            console.log(`✅ SUCCESS: Replay attack successfully blocked by PartyBidAquaApp!`);
        } else {
            console.log(`❌ FAILURE: Unexpected replay error: ${e.message}`);
        }
    }
}

main().catch(console.error);
