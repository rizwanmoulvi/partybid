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
    
    // Load Aqua deployment
    const aquaDeploymentPath = path.resolve('deployments/arc-testnet/aqua.json');
    if (!fs.existsSync(aquaDeploymentPath)) throw new Error("Deploy Aqua first!");
    const aquaDeployment = JSON.parse(fs.readFileSync(aquaDeploymentPath, 'utf8'));

    const aquaAddress = aquaDeployment.address;
    const wethAddress = aquaDeployment.wusdc;
    const owner = wallet.address;
    const name = "1inch AquaSwapVM Router";
    const version = "1";

    console.log(`[1] Deploying AquaSwapVMRouter...`);
    console.log(`    Aqua: ${aquaAddress}`);
    console.log(`    WETH: ${wethAddress}`);
    console.log(`    Owner: ${owner}`);
    console.log(`    Name: ${name}`);
    console.log(`    Version: ${version}`);

    // Load compiled artifact
    const artifactPath = path.resolve('1inch-swap-vm/out/AquaSwapVMRouter.sol/AquaSwapVMRouter.json');
    if (!fs.existsSync(artifactPath)) throw new Error("SwapVM artifact not found, wait for compilation!");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    const deployTx = await factory.deploy(aquaAddress, wethAddress, owner, name, version);
    
    console.log(`[2] Deployment Tx Hash: ${deployTx.deploymentTransaction().hash}`);
    await deployTx.waitForDeployment();
    
    const deployedAddress = await deployTx.getAddress();
    console.log(`[2] AquaSwapVMRouter Deployed At: ${deployedAddress}`);

    aquaDeployment.swapVmRouter = deployedAddress;
    fs.writeFileSync(aquaDeploymentPath, JSON.stringify(aquaDeployment, null, 2));
    
    console.log("[3] Updated deployments/arc-testnet/aqua.json");
}

main().catch(console.error);
