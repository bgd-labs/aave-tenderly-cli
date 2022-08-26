import { ContractFactory, providers, BigNumber, utils, Contract } from "ethers";
import path from "path";
import GOV_ABI from "./abis/govV2.json";

const GOV = "0xEC568fffba86c094cf06b22134B23074DFE2252c";
const SHORT_EXECUTOR = "0xEE56e2B3D491590B5b31738cC34d5232F378a8D5";
const AAVE_WHALE = "0x25F2226B597E8F9514B3F68F00f494cF4f286491";

interface DefaultInterface {
  provider: providers.StaticJsonRpcProvider;
}

interface DeployPayload extends DefaultInterface {
  filePath: string;
}
/**
 *
 * @param {*} path
 * @returns payloadAddress
 */
export async function deployPayload({ filePath, provider }: DeployPayload) {
  const artifact = require(path.join(process.cwd(), filePath));
  // Deploy the payload
  const factory = new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    provider.getSigner(AAVE_WHALE)
  );

  const payload = await factory.deploy();
  console.log(`ProposalPayload deployed: ${payload.address}`);
  return payload.address;
}

interface CreateProposal extends DefaultInterface {
  payloadAddress: string;
}
/**
 *
 * @param {*} param0
 * @returns proposalId
 */
export async function createProposal({
  payloadAddress,
  provider,
}: CreateProposal) {
  // Create the proposal
  const governance = new Contract(GOV, GOV_ABI, provider.getSigner(AAVE_WHALE));

  await (
    await governance.create(
      SHORT_EXECUTOR,
      [payloadAddress],
      [0],
      ["execute()"],
      ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      [true],
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ).wait();

  const proposalId = (await governance.getProposalsCount()) - 1;
  console.log(`Proposal created: ${proposalId}`);
  return proposalId;
}

interface PassAndExecuteProposal extends DefaultInterface {
  proposalId: number;
}
/**
 *
 * @param {*} param0
 */
export async function passAndExecuteProposal({
  proposalId,
  provider,
}: PassAndExecuteProposal) {
  const governance = new Contract(GOV, GOV_ABI, provider.getSigner(AAVE_WHALE));
  // alter forVotes storage so the proposal passes
  await provider.send("tenderly_setStorageAt", [
    GOV,
    BigNumber.from(
      utils.keccak256(
        utils.defaultAbiCoder.encode(
          ["uint256", "uint256"],
          [proposalId, "0x4"]
        )
      )
    )
      .add(11)
      .toHexString(),
    utils.hexZeroPad(utils.parseEther("5000000").toHexString(), 32),
  ]);
  // queue proposal
  const activeProposal = await governance.getProposalById(proposalId);
  await provider.send("evm_increaseBlocks", [
    BigNumber.from(activeProposal.endBlock)
      .sub(BigNumber.from(activeProposal.startBlock))
      .add(1)
      .toHexString(),
  ]);

  await governance.queue(proposalId);

  // execute proposal
  const queuedProposal = await governance.getProposalById(proposalId);
  const timestamp = (await (provider as any).getBlock()).timestamp;
  await provider.send("evm_increaseTime", [
    BigNumber.from(queuedProposal.executionTime)
      .sub(timestamp)
      .add(1)
      .toNumber(),
  ]);

  await governance.execute(proposalId);
  console.log("Proposal executed");
}
