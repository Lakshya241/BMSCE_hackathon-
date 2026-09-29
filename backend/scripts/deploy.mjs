/**
 * Compile + deploy ChainSentry.sol to the MST Testnet.
 * Reads MST_RPC_URL / MST_PRIVATE_KEY from backend/.env (via dotenv).
 * Writes backend/contracts/deployment.json with the deployed address.
 *
 * Run:  cd backend && node scripts/deploy.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const RPC = process.env.MST_RPC_URL;
const KEY = process.env.MST_PRIVATE_KEY;
const CHAIN_ID = process.env.MST_CHAIN_ID;

if (!RPC || !KEY) {
  console.error("Missing MST_RPC_URL or MST_PRIVATE_KEY in backend/.env");
  process.exit(1);
}

// ---------------- compile ----------------
const solc = require("solc");
const source = fs.readFileSync(path.join(__dirname, "..", "contracts", "ChainSentry.sol"), "utf-8");

const input = {
  language: "Solidity",
  sources: { "ChainSentry.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};

console.log("⚙  compiling ChainSentry.sol with solc", solc.version(), "…");
const output = JSON.parse(solc.compile(JSON.stringify(input)));

for (const errors of Object.values(output.errors ?? [])) {
  if (errors.severity === "error") {
    console.error(errors.formattedMessage);
    process.exit(1);
  }
}

const contract = output.contracts["ChainSentry.sol"]["ChainSentry"];
const abi = contract.abi;
const bytecode = "0x" + contract.evm.bytecode.object;
console.log("  ✓ compiled — bytecode", (bytecode.length - 2) / 2, "bytes");

// ---------------- deploy ----------------
const { ethers } = await import("ethers");
const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID ? Number(CHAIN_ID) : undefined, { staticNetwork: true });
const wallet = new ethers.Wallet(KEY, provider);

const net = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
console.log("  network:", net.chainId.toString(), "| wallet:", wallet.address, "| balance:", ethers.formatEther(balance));

if (balance === 0n) {
  console.error("  ✗ wallet has no gas. Claim tMSTC at the faucet first (see backend/.env comments).");
  process.exit(1);
}

console.log("🚀 deploying ChainSentry …");
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contractDeploy = await factory.deploy();
const receipt = await contractDeploy.waitForDeployment();
const address = await contractDeploy.getAddress();
const depReceipt = await provider.getTransactionReceipt(contractDeploy.deploymentTransaction().hash);

console.log("\n  ✅ ChainSentry deployed at:", address);
console.log("     tx:      ", contractDeploy.deploymentTransaction().hash);
console.log("     block:   ", depReceipt.blockNumber);
console.log("     gas used:", depReceipt.gasUsed.toString());

fs.writeFileSync(
  path.join(__dirname, "..", "contracts", "deployment.json"),
  JSON.stringify(
    {
      network: "MST Testnet",
      chainId: net.chainId.toString(),
      rpc: RPC,
      address,
      txHash: contractDeploy.deploymentTransaction().hash,
      blockNumber: depReceipt.blockNumber,
      deployer: wallet.address,
      deployedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log("  📄 saved → backend/contracts/deployment.json");
process.exit(0);
