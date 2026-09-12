import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Define ABI/Bytecodes
const appArtifactPath = path.resolve('out/PartyBidAquaApp.sol/PartyBidAquaApp.json');
const appArtifact = JSON.parse(fs.readFileSync(appArtifactPath, 'utf8'));

// We need a Mock Aqua Registry for the local test since we don't have the real one on local Anvil.
// Wait, the prompt says: "create test maker, ship real/test Aqua virtual balance..."
// Is it a local test with a mocked Aqua, or are we using Anvil?
// We can deploy a MockAquaRegistry in the test script and test it!

const mockAquaSource = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract MockAqua {
    mapping(address => mapping(address => mapping(bytes32 => mapping(address => uint256)))) public balances;
    address public wusdc;
    constructor(address _wusdc) { wusdc = _wusdc; }
    
    function setVirtualBalance(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external {
        balances[maker][app][strategyHash][token] = amount;
    }
    
    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external {
        uint256 bal = balances[maker][msg.sender][strategyHash][token];
        require(bal >= amount, "Not enough virtual balance");
        balances[maker][msg.sender][strategyHash][token] = bal - amount;
        
        // Transfer physical tokens
        (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", maker, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }
}
`;

// Also Mock ERC20
const mockErc20Source = `
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
`;

async function main() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Reset Anvil
    await provider.send("anvil_reset", []);
    
    // Default Anvil accounts
    const signers = [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
        "0x92db14e408432a5df9b3a329d91f6300435b6a71ea5f0db2908f0a049400db42"
    ].map(pk => new ethers.Wallet(pk, provider));

    const deployer = signers[0];
    const maker = signers[1];
    const settlementSigner = signers[2];
    const recipient = signers[3];

    // Read compiled mocks
    const erc20Artifact = JSON.parse(fs.readFileSync('out/MockERC20.sol/MockERC20.json', 'utf8'));
    const aquaArtifact = JSON.parse(fs.readFileSync('out/MockAqua.sol/MockAqua.json', 'utf8'));

    const deployerNonceManager = new ethers.NonceManager(deployer);
    const mockAquaDeployerNonceManager = new ethers.NonceManager(signers[5]);
    
    // Deploy Mock WUSDC
    const erc20Factory = new ethers.ContractFactory(erc20Artifact.abi, erc20Artifact.bytecode.object, signers[4]);
    const wusdc = await erc20Factory.deploy();
    await wusdc.waitForDeployment();
    const wusdcAddr = await wusdc.getAddress();

    // Deploy Mock Aqua
    const aquaFactory = new ethers.ContractFactory(aquaArtifact.abi, aquaArtifact.bytecode.object, mockAquaDeployerNonceManager);
    const mockAqua = await aquaFactory.deploy(wusdcAddr);
    await mockAqua.waitForDeployment();
    const mockAquaAddr = await mockAqua.getAddress();

    // Deploy PartyBidAquaApp
    const platformRecipient = signers[6];
    const appFactory = new ethers.ContractFactory(appArtifact.abi, appArtifact.bytecode.object, deployerNonceManager);
    const app = await appFactory.deploy(mockAquaAddr, settlementSigner.address, wusdcAddr, platformRecipient.address);
    await app.waitForDeployment();
    const appAddr = await app.getAddress();

    const makerNonceManager = new ethers.NonceManager(maker);

    // Setup Maker physical balance & allowance to MockAqua
    const txMint = await wusdc.connect(makerNonceManager).mint(maker.address, ethers.parseUnits("100", 18));
    await txMint.wait();
    const txApprove = await wusdc.connect(makerNonceManager).approve(mockAquaAddr, ethers.MaxUint256);
    await txApprove.wait();

    console.log("Environment Ready");

    // EIP-712 Domain
    const chainId = (await provider.getNetwork()).chainId;
    const domain = {
        name: "PartyBidAquaApp",
        version: "1",
        chainId,
        verifyingContract: appAddr
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

    let settlementNonceCounter = 1;
    const getSettlement = () => ({
        partyId: ethers.id("party1"),
        songRequestId: ethers.id("req1"),
        bidId: ethers.id("bid1"),
        maker: maker.address,
        strategyHash: ethers.id("strat1" + settlementNonceCounter),
        token: wusdcAddr,
        amount: ethers.parseUnits("5", 18),
        outcome: ethers.id("PLAYER_PAYOUT"),
        recipient: recipient.address,
        nonce: settlementNonceCounter++,
        deadline: Math.floor(Date.now() / 1000) + 3600
    });

    async function runTest(name, mutationFn, expectedError, mutateBeforeSign = false) {
        console.log(`\nTesting: ${name}`);
        deployerNonceManager.reset();
        mockAquaDeployerNonceManager.reset();
        
        const settlement = getSettlement();
        
        console.log(`      -> Setting virtual balance...`);
        // Ship virtual balance for the valid test
        const txVB = await mockAqua.connect(mockAquaDeployerNonceManager).setVirtualBalance(maker.address, appAddr, settlement.strategyHash, wusdcAddr, ethers.parseUnits("20", 18));
        await txVB.wait();
        
        if (mutateBeforeSign && mutationFn) mutationFn(settlement);
        
        let signature = await settlementSigner.signTypedData(domain, types, settlement);
        
        // Mutate AFTER signing to invalidate signature (if not already mutated)
        if (!mutateBeforeSign && mutationFn) mutationFn(settlement);
        
        // If testing wrong signer
        if (name === "Wrong signer") {
            signature = await deployer.signTypedData(domain, types, settlement); // Not the designated signer
        }

        try {
            console.log(`      -> Executing settlement...`);
            const tx = await app.connect(deployerNonceManager).executeSettlement(settlement, signature);
            console.log(`      -> Waiting for tx...`);
            await tx.wait();
            if (expectedError) {
                console.error(`❌ Expected error "${expectedError}" but transaction succeeded!`);
                process.exit(1);
            }
            
            // If it's the valid settlement test, check balances
            if (name === "Valid settlement" || name === "Valid settlement (PLATFORM_PAYOUT)") {
                const recBal = await wusdc.balanceOf(settlement.recipient);
                if (recBal !== settlement.amount) {
                    console.error("❌ Recipient did not receive funds");
                    process.exit(1);
                }
                const virtualBal = await mockAqua.balances(maker.address, appAddr, settlement.strategyHash, wusdcAddr);
                // virtual balance goes from 20 -> 15 (since it ships 20 and pulls 5)
                if (virtualBal !== ethers.parseUnits("15", 18)) {
                    console.error("❌ Virtual balance not decremented correctly (expected 15)");
                    process.exit(1);
                }
                console.log("✅ State successfully verified");
            } else {
                console.log("✅ Executed successfully");
            }
        } catch (e) {
            if (!expectedError) {
                console.error(`❌ Unexpected error: ${e.message}`);
                process.exit(1);
            } else if (e.message.includes(expectedError) || (e.data && e.data.message && e.data.message.includes(expectedError))) {
                console.log(`✅ Reverted as expected: ${expectedError}`);
            } else {
                console.error(`❌ Expected error "${expectedError}" but got: ${e.message}`);
                process.exit(1);
            }
        }
    }

    await runTest("Valid settlement", null, null);
    
    // Replay attack test
    console.log(`\nTesting: Replay`);
    deployerNonceManager.reset();
    mockAquaDeployerNonceManager.reset();
    const s = getSettlement();
    const txReplayVB = await mockAqua.connect(mockAquaDeployerNonceManager).setVirtualBalance(maker.address, appAddr, s.strategyHash, wusdcAddr, ethers.parseUnits("10", 18));
    await txReplayVB.wait();
    const sig = await settlementSigner.signTypedData(domain, types, s);
    
    // First execution should succeed
    const txReplay1 = await app.connect(deployerNonceManager).executeSettlement(s, sig);
    await txReplay1.wait();
    
    // Second execution should fail
    try {
        await app.connect(deployerNonceManager).executeSettlement(s, sig);
        console.error("❌ Replay succeeded!");
        process.exit(1);
    } catch(e) {
        if (e.message.includes("Settlement already executed")) {
            console.log("✅ Reverted as expected: Settlement already executed");
        } else {
            console.error(`❌ Unexpected error during replay: ${e.message}`);
        }
    }

    await runTest("Invalid signature (Wrong amount)", (s) => { s.amount = ethers.parseUnits("10", 18); }, "Invalid settlement signature");
    await runTest("Wrong recipient", (s) => { s.recipient = deployer.address; }, "Invalid settlement signature");
    await runTest("Wrong maker", (s) => { s.maker = deployer.address; }, "Invalid settlement signature");
    await runTest("Wrong strategyHash", (s) => { s.strategyHash = ethers.id("wrong"); }, "Invalid settlement signature");
    await runTest("Wrong token", (s) => { s.token = appAddr; }, "Invalid token");
    await runTest("Wrong party/request/bid", (s) => { s.partyId = ethers.id("wrong"); }, "Invalid settlement signature");
    await runTest("Expired authorization", (s) => { s.deadline = 0; }, "Expired deadline");
    await runTest("Wrong signer", null, "Invalid settlement signature");
    
    // NEW ON-CHAIN INVARIANT TESTS
    await runTest("Valid settlement (PLATFORM_PAYOUT)", (s) => {
        s.outcome = ethers.id("PLATFORM_PAYOUT");
        s.recipient = platformRecipient.address;
    }, null, true);

    await runTest("Invalid token invariant", (s) => {
        s.token = mockAquaAddr; // Any other address
    }, "Invalid token", true);

    await runTest("Invalid platform recipient invariant", (s) => {
        s.outcome = ethers.id("PLATFORM_PAYOUT");
        // Leave recipient as standard recipient instead of platformRecipient
    }, "Invalid platform recipient", true);

    await runTest("Arbitrary unsupported outcome invariant", (s) => {
        s.outcome = ethers.id("SOMETHING_ELSE");
    }, "Unsupported outcome", true);
    
    console.log(`\n✅ All local tests passed!`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
