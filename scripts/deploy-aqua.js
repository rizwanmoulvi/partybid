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
    console.log(`[1] Deployer Wallet: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`[1] Native Balance: ${ethers.formatEther(balance)}`);
    
    const network = await provider.getNetwork();
    console.log(`[2] Network: ${network.name}, Chain ID: ${network.chainId}`);

    // Verify Token Configuration
    const WUSDC_ADDRESS = '0x911b4000D3422F482F4062a913885f7b035382Df';
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];
    const wusdc = new ethers.Contract(WUSDC_ADDRESS, erc20Abi, provider);
    const symbol = await wusdc.symbol();
    const decimals = await wusdc.decimals();
    console.log(`[3] Token Verified: ${symbol} (${decimals} decimals) at ${WUSDC_ADDRESS}`);
    
    // Load compiled artifact
    const artifactPath = path.resolve('1inch-aqua/out/AquaRouter.sol/AquaRouter.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Deploy AquaRouter
    console.log("[4] Deploying AquaRouter...");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    
    const deployTx = await factory.deploy();
    console.log(`[4] Deployment Tx Hash: ${deployTx.deploymentTransaction().hash}`);
    
    await deployTx.waitForDeployment();
    
    const deployedAddress = await deployTx.getAddress();
    const receipt = await deployTx.deploymentTransaction().wait();
    
    console.log(`[4] AquaRouter Deployed At: ${deployedAddress}`);
    console.log(`[4] Deployment Block: ${receipt.blockNumber}`);

    // Verify Bytecode
    const code = await provider.getCode(deployedAddress);
    console.log(`[5] Bytecode Length: ${code.length > 2 ? (code.length - 2) / 2 : 0} bytes`);
    if (code.length <= 2) throw new Error("Deployed bytecode is empty!");

    // Save deployment output
    const outputDir = path.resolve('deployments/arc-testnet');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const output = {
        network: "Arc Testnet",
        chainId: network.chainId.toString(),
        contract: "AquaRouter",
        source: "https://github.com/1inch/aqua/tree/0.1.0",
        address: deployedAddress,
        deployer: wallet.address,
        txHash: deployTx.deploymentTransaction().hash,
        block: receipt.blockNumber,
        wusdc: WUSDC_ADDRESS
    };
    
    fs.writeFileSync(path.join(outputDir, 'aqua.json'), JSON.stringify(output, null, 2));
    console.log("[6] Deployment configuration saved to deployments/arc-testnet/aqua.json");
}

main().catch(console.error);
