import { ethers } from 'ethers';
import 'dotenv/config';

async function main() {
    const rpcUrl = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const aquaRegistry = '0x1111113ccf1426a8e30e2bff5e005d929bf6a90a';
    const swapVm = '0x111111338c5091e8440b67b168bae16a668ac0de';

    const code1 = await provider.getCode(aquaRegistry);
    console.log(`Aqua Registry Code Size: ${code1.length > 2 ? (code1.length - 2) / 2 : 0} bytes`);

    const code2 = await provider.getCode(swapVm);
    console.log(`SwapVM Code Size: ${code2.length > 2 ? (code2.length - 2) / 2 : 0} bytes`);
}

main();
