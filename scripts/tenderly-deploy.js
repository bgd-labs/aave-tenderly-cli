/**
 * This script deploys the contract on a tenderly fork and executes it.
 * To test on the ui you have to create a fork on chainId 1 and setup your metamask accordingly.
 * The ui will then automatically show the forked state.
 */
import ethers from "ethers";
import contract from "../out/ProposalPayloadAaveFreezeV1.sol/ProposalPayloadAaveFreezeV1.json" assert { type: "json" };
import GOV_ARTIFACT from "../out/GovHelpers.sol/IAaveGov.json" assert { type: "json" };

const GOV = "0xEC568fffba86c094cf06b22134B23074DFE2252c";
const SHORT_EXECUTOR = "0xEE56e2B3D491590B5b31738cC34d5232F378a8D5";
const AAVE_WHALE = "0x25F2226B597E8F9514B3F68F00f494cF4f286491";
const TENDERLY_FORK_URL = process.env.TENDERLY_FORK_URL;

if (!TENDERLY_FORK_URL) throw new Error("you have to set a TENDERLY_FORK_URL");

const provider = new ethers.providers.StaticJsonRpcProvider(TENDERLY_FORK_URL);

// Deploy the payload
const factory = new ethers.ContractFactory(
  contract.abi,
  contract.bytecode,
  provider.getSigner(AAVE_WHALE)
);

const payload = await factory.deploy();

// Create the proposal
const governance = new ethers.Contract(
  GOV,
  GOV_ARTIFACT.abi,
  provider.getSigner(AAVE_WHALE)
);

await (
  await governance.create(
    SHORT_EXECUTOR,
    [payload.address],
    [0],
    ["execute()"],
    ["0x0000000000000000000000000000000000000000000000000000000000000000"],
    [true],
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  )
).wait();

const id = (await governance.getProposalsCount()) - 1;

// alter forVotes storage so the proposal passes
await provider.send("tenderly_setStorageAt", [
  GOV,
  ethers.BigNumber.from(
    ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [id, "0x4"])
    )
  )
    .add(11)
    .toHexString(),
  ethers.utils.hexZeroPad(ethers.utils.parseEther("5000000").toHexString(), 32),
]);

// queue proposal
const activeProposal = await governance.getProposalById(id);
await provider.send("evm_increaseBlocks", [
  ethers.BigNumber.from(activeProposal.endBlock)
    .sub(ethers.BigNumber.from(activeProposal.startBlock))
    .add(1)
    .toHexString(),
]);

await governance.queue(id);

// execute proposal
const queuedProposal = await governance.getProposalById(id);
const timestamp = (await provider.getBlock()).timestamp;
await provider.send("evm_increaseTime", [
  ethers.BigNumber.from(queuedProposal.executionTime)
    .sub(timestamp)
    .add(1)
    .toNumber(),
]);

await governance.execute(id);

