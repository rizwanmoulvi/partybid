import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
    if (!privateKey) throw new Error("AQUA_TEST_PRIVATE_KEY missing");
    
    const wallet = new ethers.Wallet(privateKey, provider);
    // recipient is a random wallet to observe physical transfer
    const recipient = ethers.Wallet.createRandom().address;

    const aquaRegistryAddress = process.env.NEXT_PUBLIC_AQUA_REGISTRY;
    const wusdcAddress = process.env.NEXT_PUBLIC_WUSDC;
    
    if (!aquaRegistryAddress || !wusdcAddress) {
        throw new Error("Missing Aqua or WUSDC address in .env.local");
    }

    const aquaAbi = [
        "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)",
        "function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external",
        "function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)",
        "event Shipped(address indexed maker, address indexed app, bytes32 indexed strategyHash, bytes strategy)",
        "event Pulled(address indexed maker, address indexed app, bytes32 indexed strategyHash, address token, uint256 amount)"
    ];
    
    const wusdcAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function decimals() view returns (uint8)"
    ];

    const aqua = new ethers.Contract(aquaRegistryAddress, aquaAbi, wallet);
    const wusdc = new ethers.Contract(wusdcAddress, wusdcAbi, wallet);
    
    const decimals = await wusdc.decimals();
    
    // We are testing a one-sided pull, so we only need to query one token, but safeBalances takes two.
    // We'll pass wusdcAddress twice just to satisfy the method signature and read balance0.
    async function getVirtualBalance(maker, app, strategyHash, token) {
        try {
            const [b0] = await aqua.safeBalances(maker, app, strategyHash, token, token);
            return b0;
        } catch (e) {
            // safeBalances reverts if the strategy is DOCKED or token is inactive, which is expected
            return 0n;
        }
    }

    console.log(`[1] Configuration`);
    console.log(`    Maker:     ${wallet.address}`);
    console.log(`    Recipient: ${recipient}`);
    console.log(`    Aqua:      ${aquaRegistryAddress}`);
    console.log(`    WUSDC:     ${wusdcAddress}`);

    const testAmount = ethers.parseUnits("0.1", decimals);
    console.log(`    Amount:    0.1 WUSDC (${testAmount.toString()} wei)`);

    // Ensure allowance
    const allowance = await wusdc.allowance(wallet.address, aquaRegistryAddress);
    if (allowance < testAmount) {
        console.log(`[2] Approving WUSDC to Aqua Registry...`);
        const txApprove = await wusdc.approve(aquaRegistryAddress, ethers.MaxUint256);
        await txApprove.wait();
    } else {
        console.log(`[2] WUSDC allowance sufficient.`);
    }

    // Since we are calling pull() directly from the wallet, the wallet itself acts as the "app".
    const app = wallet.address; 
    
    // Generate deterministic strategy hash
    const strategyBytes = ethers.solidityPacked(["address", "uint256"], [wallet.address, Date.now()]);
    const expectedStrategyHash = ethers.keccak256(strategyBytes);

    console.log(`\n[3] Pre-Ship State`);
    const preShipMakerWusdc = await wusdc.balanceOf(wallet.address);
    const preShipVirtual = await getVirtualBalance(wallet.address, app, expectedStrategyHash, wusdcAddress);
    
    console.log(`    Maker WUSDC:   ${ethers.formatUnits(preShipMakerWusdc, decimals)}`);
    console.log(`    Virtual Bal:   ${ethers.formatUnits(preShipVirtual, decimals)}`);

    console.log(`\n[4] Executing ship()`);
    const txShip = await aqua.ship(app, strategyBytes, [wusdcAddress], [testAmount]);
    const receiptShip = await txShip.wait();
    console.log(`    Tx Hash:       ${txShip.hash}`);
    console.log(`    Block:         ${receiptShip.blockNumber}`);
    
    console.log(`\n[5] Pre-Pull State (Post-Ship)`);
    const prePullMakerWusdc = await wusdc.balanceOf(wallet.address);
    const prePullRecipientWusdc = await wusdc.balanceOf(recipient);
    const prePullVirtual = await getVirtualBalance(wallet.address, app, expectedStrategyHash, wusdcAddress);
    
    console.log(`    Maker WUSDC:   ${ethers.formatUnits(prePullMakerWusdc, decimals)}`);
    console.log(`    Recip WUSDC:   ${ethers.formatUnits(prePullRecipientWusdc, decimals)}`);
    console.log(`    Virtual Bal:   ${ethers.formatUnits(prePullVirtual, decimals)}`);

    if (prePullVirtual < testAmount) {
        throw new Error("Virtual balance not created correctly by ship!");
    }

    console.log(`\n[6] Executing pull()`);
    const txPull = await aqua.pull(wallet.address, expectedStrategyHash, wusdcAddress, testAmount, recipient);
    const receiptPull = await txPull.wait();
    console.log(`    Tx Hash:       ${txPull.hash}`);
    console.log(`    Block:         ${receiptPull.blockNumber}`);

    console.log(`\n[7] Post-Pull State`);
    const postPullMakerWusdc = await wusdc.balanceOf(wallet.address);
    const postPullRecipientWusdc = await wusdc.balanceOf(recipient);
    const postPullVirtual = await getVirtualBalance(wallet.address, app, expectedStrategyHash, wusdcAddress);
    
    console.log(`    Maker WUSDC:   ${ethers.formatUnits(postPullMakerWusdc, decimals)}`);
    console.log(`    Recip WUSDC:   ${ethers.formatUnits(postPullRecipientWusdc, decimals)}`);
    console.log(`    Virtual Bal:   ${ethers.formatUnits(postPullVirtual, decimals)}`);
    
    console.log(`\n[8] Verification`);
    const expectedMakerWusdc = prePullMakerWusdc - testAmount;
    const expectedRecipientWusdc = prePullRecipientWusdc + testAmount;
    
    console.log(`    Maker WUSDC expected:   ${ethers.formatUnits(expectedMakerWusdc, decimals)} (Matched: ${postPullMakerWusdc === expectedMakerWusdc})`);
    console.log(`    Recip WUSDC expected:   ${ethers.formatUnits(expectedRecipientWusdc, decimals)} (Matched: ${postPullRecipientWusdc === expectedRecipientWusdc})`);
    
    if (postPullRecipientWusdc === expectedRecipientWusdc) {
        console.log(`\n✅ SUCCESS: pull() physically transferred WUSDC to the recipient!`);
    } else {
        console.log(`\n❌ FAILURE: pull() did not physically transfer the expected amount.`);
    }

    // Print Events
    const pulledEvent = receiptPull.logs.find(log => {
        try {
            return aqua.interface.parseLog({ topics: log.topics.slice(), data: log.data })?.name === 'Pulled';
        } catch(e) { return false; }
    });
    
    if (pulledEvent) {
        const parsed = aqua.interface.parseLog({ topics: pulledEvent.topics.slice(), data: pulledEvent.data });
        console.log(`\n[9] Emitted Event: Pulled`);
        console.log(`    maker:        ${parsed.args.maker}`);
        console.log(`    app:          ${parsed.args.app}`);
        console.log(`    strategyHash: ${parsed.args.strategyHash}`);
        console.log(`    token:        ${parsed.args.token}`);
        console.log(`    amount:       ${ethers.formatUnits(parsed.args.amount, decimals)}`);
    }
}

main().catch(console.error);
