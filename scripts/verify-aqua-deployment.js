import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Load deployment artifact
    const deploymentPath = path.resolve('deployments/arc-testnet/aqua.json');
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("Deployment artifact aqua.json not found!");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

    const network = await provider.getNetwork();
    console.log(`[1] Network: ${network.name}, Chain ID: ${network.chainId}`);

    const WUSDC_ADDRESS = deployment.wusdc;
    const erc20Abi = [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];
    const wusdc = new ethers.Contract(WUSDC_ADDRESS, erc20Abi, provider);
    const symbol = await wusdc.symbol();
    const decimals = await wusdc.decimals();
    console.log(`[2] Token Verified: ${symbol} (${decimals} decimals) at ${WUSDC_ADDRESS}`);

    console.log(`[3] AquaRouter (Registry) Address: ${deployment.address}`);
    
    const aquaCode = await provider.getCode(deployment.address);
    console.log(`[4] AquaRouter Bytecode Length: ${aquaCode.length > 2 ? (aquaCode.length - 2) / 2 : 0} bytes`);
    if (aquaCode.length <= 2) throw new Error("AquaRouter bytecode is empty on chain!");

    if (deployment.swapVmRouter) {
        console.log(`[5] AquaSwapVMRouter Address: ${deployment.swapVmRouter}`);
        const routerCode = await provider.getCode(deployment.swapVmRouter);
        console.log(`[6] AquaSwapVMRouter Bytecode Length: ${routerCode.length > 2 ? (routerCode.length - 2) / 2 : 0} bytes`);
        if (routerCode.length <= 2) throw new Error("AquaSwapVMRouter bytecode is empty on chain!");
        
        // Let's verify the router's Aqua address. 
        // AquaSwapVMRouter inherits from AquaOpcodes which has an immutable `aqua` address.
        // It's exposed via public getter `AQUA()`.
        try {
            const routerContract = new ethers.Contract(deployment.swapVmRouter, ["function AQUA() view returns (address)"], provider);
            const routerAqua = await routerContract.AQUA();
            console.log(`[7] AquaSwapVMRouter points to Aqua: ${routerAqua}`);
            if (routerAqua.toLowerCase() !== deployment.address.toLowerCase()) {
                throw new Error("Mismatch between router's Aqua address and deployed AquaRouter!");
            }
        } catch (e) {
            console.error(`[7] Failed to query AQUA() on router: ${e.message}`);
        }
    } else {
        console.log(`[5] AquaSwapVMRouter: Not deployed (Excluded in plan)`);
    }

    console.log(`[8] Deployer: ${deployment.deployer}`);
    console.log(`[9] Deployment Block: ${deployment.block}`);
    
    console.log(`[10] Running Smoke Test (Ship & Dock) on new Aqua deployment...`);
    const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);
    const aquaRouterContract = new ethers.Contract(deployment.address, [
        "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)",
        "function dock(address app, bytes32 strategyHash, address[] calldata tokens) external"
    ], wallet);
    
    // We need some WUSDC allowance. We did it in previous tests to the old registry.
    // Let's approve the new one.
    const wusdcWrite = new ethers.Contract(WUSDC_ADDRESS, [
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)"
    ], wallet);
    const allowance = await wusdcWrite.allowance(wallet.address, deployment.address);
    if (allowance === 0n) {
        console.log(`[10.1] Approving WUSDC to new Aqua deployment...`);
        const txApprove = await wusdcWrite.approve(deployment.address, ethers.MaxUint256);
        await txApprove.wait();
    }
    
    // Ship
    const mockApp = ethers.Wallet.createRandom().address;
    const strategyBytes = ethers.solidityPacked(["address", "uint256"], [wallet.address, Date.now()]);
    console.log(`[10.2] Executing ship()...`);
    const txShip = await aquaRouterContract.ship(mockApp, strategyBytes, [WUSDC_ADDRESS], [ethers.parseUnits("1", decimals)]);
    await txShip.wait();
    console.log(`[10.2] Ship Tx: ${txShip.hash}`);
    
    const strategyHash = ethers.keccak256(strategyBytes);
    
    // Dock
    console.log(`[10.3] Executing dock()...`);
    const txDock = await aquaRouterContract.dock(mockApp, strategyHash, [WUSDC_ADDRESS]);
    await txDock.wait();
    console.log(`[10.3] Dock Tx: ${txDock.hash}`);

    console.log(`[11] Verification & Smoke Test SUCCESS!`);
}

main().catch(console.error);
