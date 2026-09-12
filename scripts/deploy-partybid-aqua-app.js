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

    const aquaRegistryAddress = process.env.NEXT_PUBLIC_AQUA_REGISTRY;
    if (!aquaRegistryAddress) throw new Error("NEXT_PUBLIC_AQUA_REGISTRY missing");

    const wusdcAddress = process.env.NEXT_PUBLIC_WUSDC;
    if (!wusdcAddress) throw new Error("NEXT_PUBLIC_WUSDC missing");

    const platformRecipient = ethers.Wallet.createRandom().address;

    // Using the same wallet as the settlement signer for testnet
    const settlementSignerAddress = wallet.address;

    const appArtifactPath = path.resolve('out/PartyBidAquaApp.sol/PartyBidAquaApp.json');
    const appArtifact = JSON.parse(fs.readFileSync(appArtifactPath, 'utf8'));

    const factory = new ethers.ContractFactory(appArtifact.abi, appArtifact.bytecode.object, wallet);
    
    console.log(`[1] Deploying Hardened PartyBidAquaApp...`);
    console.log(`    Aqua:   ${aquaRegistryAddress}`);
    console.log(`    Signer: ${settlementSignerAddress}`);
    console.log(`    WUSDC:  ${wusdcAddress}`);
    console.log(`    Platform: ${platformRecipient}`);

    const app = await factory.deploy(aquaRegistryAddress, settlementSignerAddress, wusdcAddress, platformRecipient);
    const receipt = await app.deploymentTransaction().wait();
    const appAddr = await app.getAddress();

    console.log(`[2] Deployed at: ${appAddr}`);
    console.log(`    Tx: ${receipt.hash}`);
    console.log(`    Block: ${receipt.blockNumber}`);

    // Verify
    const code = await provider.getCode(appAddr);
    if (code === '0x') throw new Error("Deployment failed, no bytecode");
    console.log(`[3] Bytecode verified!`);
    
    // Save to env (do not overwrite the old one)
    const envPath = '.env.local';
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (!envContent.includes('PREVIOUS_PARTYBID_AQUA_APP')) {
        envContent = envContent.replace('NEXT_PUBLIC_PARTYBID_AQUA_APP', 'PREVIOUS_PARTYBID_AQUA_APP');
    }
    envContent += `\nNEXT_PUBLIC_PARTYBID_AQUA_APP=${appAddr}\nPLATFORM_RECIPIENT=${platformRecipient}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log(`[4] Saved to .env.local`);
}

main().catch(console.error);
