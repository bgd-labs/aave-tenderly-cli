/**
 * This script is to pass a specific proposal and get the fork parameters to test on the Aave interface
 */

import 'dotenv/config';
import ethers from "ethers";
import axios from 'axios';

// contracts
import GOV_ABI from "../abis/govV2.json" assert {type: 'json'};

// -------------------------------------------------------------
//                   TENDERLY FORK GENERATION
// -------------------------------------------------------------

// the network and block where Tenderly fork gets created.
const forkChainId = 3030;
// ----- Modify this parameters to test specific proposal on specific network and blockNumber
const chainToFork = '1';
const blockToFork = 15407942;
const proposalId = 95;

const forkingPoint = {
    network_id: chainToFork,
    block_number: blockToFork,
    chain_config: { chain_id: forkChainId },
    alias: `proposal-${proposalId}`
};

// an axios instance to make requests to Tenderly, for re-use purposes
const axiosOnTenderly = axios.create({
    baseURL: "https://api.tenderly.co/api/v1",
    headers: {
        "X-Access-Key": process.env.TENDERLY_ACCESS_KEY || "",
        "Content-Type": "application/json",
    },
});

const projectUrl = `account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}`;

// create the specified fork programmatically
const forkResponse = await axiosOnTenderly.post(`${projectUrl}/fork`, forkingPoint);
const forkId = forkResponse.data.root_transaction.fork_id;

// create the provider you can use throughout the rest of your test
const forkUrl = `https://rpc.tenderly.co/fork/${forkId}`;
const provider = new ethers.providers.JsonRpcProvider(forkUrl);

// mainnet addresses and constants
const AAVE_WHALE = "0x25F2226B597E8F9514B3F68F00f494cF4f286491";
const GOV = "0xEC568fffba86c094cf06b22134B23074DFE2252c";

// -------------------------------------------------------------
//                   GOVERNANCE INTERACTIONS
// -------------------------------------------------------------

// create Gov contract
const governance = new ethers.Contract(
    GOV,
    GOV_ABI,
    provider.getSigner(AAVE_WHALE)
);

// Pass proposal by altering forVotes on storage slot
await provider.send("tenderly_setStorageAt", [
    GOV,
    ethers.BigNumber.from(
        ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [proposalId, "0x4"])
        )
    )
        .add(11)
        .toHexString(),
    ethers.utils.hexZeroPad(ethers.utils.parseEther("5000000").toHexString(), 32),
]);

// queue proposal
const activeProposal = await governance.getProposalById(proposalId);
await provider.send("evm_increaseBlocks", [
    ethers.BigNumber.from(activeProposal.endBlock)
        .sub(ethers.BigNumber.from(activeProposal.startBlock))
        .add(1)
        .toHexString(),
]);

await governance.queue(proposalId);

// execute proposal
const queuedProposal = await governance.getProposalById(proposalId);
const currentBlock = await provider.getBlock();
await provider.send("evm_increaseTime", [
    ethers.BigNumber.from(queuedProposal.executionTime)
        .sub(currentBlock.timestamp)
        .add(1)
        .toNumber(),
]);

const proposalExecuteTx = await governance.execute(proposalId);
await proposalExecuteTx.wait();

// -------------------------------------------------------------
//                   INTERFACE COMMANDS
// -------------------------------------------------------------

console.log('------------- Copy and Paste in Aave interface to interact with fork -----------------')
console.log(`localStorage.setItem('forkEnabled', 'true')`);
console.log(`localStorage.setItem('forkBaseChainId', ${chainToFork})`);
console.log(`localStorage.setItem('forkNetworkId', ${forkChainId})`);
console.log(`localStorage.setItem("forkRPCUrl", "${forkUrl}")`);
