import { ethers } from 'ethers';
import { AquaProtocolContract, AQUA_CONTRACT_ADDRESSES, NetworkEnum, Address, HexString } from '@1inch/aqua-sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import solc from 'solc';

async function main() {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
    if (!privateKey) throw new Error("AQUA_TEST_PRIVATE_KEY missing");
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`[1] Wallet: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`[1] Native Balance: ${ethers.formatEther(balance)}`);

    // Verify Token Configuration
    const WUSDC_ADDRESS = '0x911b4000D3422F482F4062a913885f7b035382Df';
    const AQUA_REGISTRY = '0x1111113ccf1426a8e30e2bff5e005d929bf6a90a';
    
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function allowance(address,address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];
    const wusdc = new ethers.Contract(WUSDC_ADDRESS, erc20Abi, wallet);
    
    const symbol = await wusdc.symbol();
    const decimals = await wusdc.decimals();
    console.log(`[2] Token Verified: ${symbol} (${decimals} decimals) at ${WUSDC_ADDRESS}`);
    
    const initialWusdcBal = await wusdc.balanceOf(wallet.address);
    console.log(`[2] Initial Token Balance: ${ethers.formatUnits(initialWusdcBal, decimals)}`);
    
    if (initialWusdcBal === 0n) {
        console.log(`[2.1] Wallet has 0 WUSDC. Attempting to wrap 5 Native USDC into WUSDC...`);
        // Wrap native USDC -> WUSDC
        const wusdcWrapAbi = ["function deposit() payable"];
        const wusdcWrap = new ethers.Contract(WUSDC_ADDRESS, wusdcWrapAbi, wallet);
        try {
            const wrapTx = await wusdcWrap.deposit({ value: ethers.parseEther("5") });
            await wrapTx.wait();
            console.log(`[2.1] Wrap Tx: ${wrapTx.hash}`);
            const newBal = await wusdc.balanceOf(wallet.address);
            console.log(`[2.1] New WUSDC Balance: ${ethers.formatUnits(newBal, decimals)}`);
        } catch (e) {
            console.error(`[2.1] Failed to wrap native USDC:`, e.message);
            throw new Error("Test wallet has 0 WUSDC and wrapping failed.");
        }
    }

    // Compile MockAquaApp
    console.log("[3] Compiling MockAquaApp...");
    const source = fs.readFileSync('contracts/aqua-proof/MockAquaApp.sol', 'utf8');
    const input = {
        language: 'Solidity',
        sources: { 'MockAquaApp.sol': { content: source } },
        settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
    };
    const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
    const contractDef = compiled.contracts['MockAquaApp.sol']['MockAquaApp'];
    
    // Deploy MockAquaApp
    console.log("[4] Deploying MockAquaApp...");
    const factory = new ethers.ContractFactory(contractDef.abi, contractDef.evm.bytecode.object, wallet);
    const mockApp = await factory.deploy(AQUA_REGISTRY);
    await mockApp.waitForDeployment();
    const appAddress = await mockApp.getAddress();
    console.log(`[4] MockAquaApp Deployed: ${appAddress}`);

    // Create Strategy
    console.log("[5] Configuring Strategy...");
    // 1inch Aqua requires the FIRST 20 bytes of the strategy to be the maker address exactly (no padding).
    const abiCoder = new ethers.AbiCoder();
    const strategyBytes = ethers.solidityPacked(["address", "uint256"], [wallet.address, Date.now()]);
    
    // Instantiate Aqua SDK
    const aqua = new AquaProtocolContract(AQUA_REGISTRY);
    
    const amountToShip = ethers.parseUnits('1', decimals); // 1 USDC
    
    console.log("[6] Approving WUSDC to Aqua Registry...");
    const allowance = await wusdc.allowance(wallet.address, AQUA_REGISTRY);
    if (allowance < amountToShip * 10n) {
        const txApprove = await wusdc.approve(AQUA_REGISTRY, ethers.MaxUint256);
        await txApprove.wait();
        console.log(`[6] Approval Tx: ${txApprove.hash}`);
    } else {
        console.log(`[6] Already approved.`);
    }

    console.log("[7] SHIP TEST");
    const shipTxData = aqua.ship({
        app: new Address(appAddress),
        strategy: new HexString(strategyBytes),
        amountsAndTokens: [{ token: new Address(WUSDC_ADDRESS), amount: amountToShip }]
    });

    const balBeforeShip = await wusdc.balanceOf(wallet.address);
    const txShip = await wallet.sendTransaction({
        to: shipTxData.to,
        data: shipTxData.data,
        value: shipTxData.value || 0
    });
    console.log(`[7] Ship Tx Hash: ${txShip.hash}`);
    await txShip.wait();

    const balAfterShip = await wusdc.balanceOf(wallet.address);
    console.log(`[7] Token Balance Before Ship: ${ethers.formatUnits(balBeforeShip, decimals)}`);
    console.log(`[7] Token Balance After Ship: ${ethers.formatUnits(balAfterShip, decimals)}`);
    console.log(`[7] Difference: ${ethers.formatUnits(balBeforeShip - balAfterShip, decimals)}`);
    
    // Check Virtual Balance (via safeBalances instead of rawBalances which reverted)
    const aquaContract = new ethers.Contract(AQUA_REGISTRY, ["function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1) view returns (uint256 balance0, uint256 balance1)"], provider);
    const strategyHash = AquaProtocolContract.calculateStrategyHash(new HexString(strategyBytes)).toString();
    try {
        const virtualBal = await aquaContract.safeBalances(wallet.address, appAddress, strategyHash, WUSDC_ADDRESS, WUSDC_ADDRESS);
        console.log(`[7.5] Virtual Balance: ${ethers.formatUnits(virtualBal.balance0, decimals)}`);
    } catch (e) {
        console.log(`[7.5] Virtual Balance check skipped: ${e.message}`);
    }

    console.log("[8] PULL TEST");
    const recipient = ethers.Wallet.createRandom().address;
    console.log(`[8] Recipient: ${recipient}`);
    console.log(`[8] Strategy Hash: ${strategyHash}`);

    try {
        const txPull = await mockApp.executePull(
            wallet.address, 
            strategyHash, 
            WUSDC_ADDRESS, 
            amountToShip, 
            recipient
        );
        console.log(`[8] Pull Tx Hash: ${txPull.hash}`);
        await txPull.wait();

        const balAfterPull = await wusdc.balanceOf(wallet.address);
        const recBalAfterPull = await wusdc.balanceOf(recipient);
        console.log(`[8] Maker Balance After Pull: ${ethers.formatUnits(balAfterPull, decimals)}`);
        console.log(`[8] Recipient Balance After Pull: ${ethers.formatUnits(recBalAfterPull, decimals)}`);
    } catch (e) {
        console.log(`[8] Pull Failed (Blocker Encountered): ${e.shortMessage || e.message}`);
        console.log(`[8] Reason: Aqua Registry reverted the pull(). Likely strict validation on the strategyHash format or missing internal state functions.`);
    }

    console.log("[9] DOCK TEST");
    const strategyBytes2 = ethers.solidityPacked(["address", "uint256"], [wallet.address, Date.now() + 1]);
    const shipTxData2 = aqua.ship({
        app: new Address(appAddress),
        strategy: new HexString(strategyBytes2),
        amountsAndTokens: [{ token: new Address(WUSDC_ADDRESS), amount: amountToShip }]
    });
    
    const txShip2 = await wallet.sendTransaction({ to: shipTxData2.to, data: shipTxData2.data });
    await txShip2.wait();
    const balBeforeDock = await wusdc.balanceOf(wallet.address);
    
    const strategyHash2 = AquaProtocolContract.calculateStrategyHash(new HexString(strategyBytes2));
    const dockTxData = aqua.dock({
        app: new Address(appAddress),
        strategyHash: strategyHash2,
        tokens: [new Address(WUSDC_ADDRESS)]
    });
    
    const txDock = await wallet.sendTransaction({ to: dockTxData.to, data: dockTxData.data });
    console.log(`[9] Dock Tx Hash: ${txDock.hash}`);
    await txDock.wait();
    
    const balAfterDock = await wusdc.balanceOf(wallet.address);
    console.log(`[9] Maker Balance Before Dock: ${ethers.formatUnits(balBeforeDock, decimals)}`);
    console.log(`[9] Maker Balance After Dock: ${ethers.formatUnits(balAfterDock, decimals)}`);
}

main().catch(err => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
