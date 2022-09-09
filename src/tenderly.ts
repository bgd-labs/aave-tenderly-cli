import axios from "axios";
import { providers } from "ethers";

function getTenderlyClient() {
  const TENDERLY_ACCOUNT = process.env.TENDERLY_ACCOUNT;
  const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT;
  const TENDERLY_ACCESS_TOKEN = process.env.TENDERLY_ACCESS_TOKEN;
  if (!TENDERLY_ACCOUNT) throw new Error("TENDERLY_ACCOUNT must be set");
  if (!TENDERLY_PROJECT) throw new Error("TENDERLY_PROJECT must be set");
  if (!TENDERLY_ACCESS_TOKEN)
    throw new Error("TENDERLY_ACCESS_TOKEN must be set");
  // an axios instance to make requests to Tenderly, for re-use purposes
  const axiosOnTenderly = axios.create({
    baseURL: "https://api.tenderly.co/api/v1",
    headers: {
      "X-Access-Key": TENDERLY_ACCESS_TOKEN || "",
      "Content-Type": "application/json",
    },
  });

  const projectUrl = `account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}`;
  return { axiosOnTenderly, projectUrl };
}

function getForkUrl(forkId: string) {
  return `https://rpc.tenderly.co/fork/${forkId}`;
}

export function forkIdToForkParams({ forkId }: { forkId: string }) {
  const forkUrl = getForkUrl(forkId);
  return {
    forkUrl,
    provider: new providers.StaticJsonRpcProvider(forkUrl),
    forkId,
  };
}

function listenForInterruptAndKill(forkId: string) {
  console.log("warning: the fork will be deleted once this terminal is closed");
  // keep process alive
  process.stdin.resume();

  // delete fork on exit
  process.on("SIGINT", function () {
    console.log("Caught interrupt signal");
    deleteFork(forkId).then((d) => {
      console.log("fork deleted");
      process.exit(0);
    });
  });
}

export async function getForkParameters({ forkId }: { forkId: string }) {
  const { axiosOnTenderly, projectUrl } = getTenderlyClient();
  const response = await axiosOnTenderly.get(`${projectUrl}/fork/${forkId}`);
  return {
    networkId: response.data.simulation_fork.network_id,
    forkNetworkId: response.data.simulation_fork.chain_config.chain_id,
    blockNumber: response.data.simulation_fork.block_number,
  };
}

export async function createFork({
  alias,
  networkId = "1",
  forkNetworkId,
  blockNumber,
  keepAlive,
}: {
  alias?: string;
  networkId?: string;
  forkNetworkId: string;
  blockNumber?: string;
  keepAlive?: boolean;
}) {
  const { axiosOnTenderly, projectUrl } = getTenderlyClient();
  const forkingPoint = {
    network_id: Number(networkId),
    chain_config: { chain_id: Number(forkNetworkId) },
  };
  if (blockNumber) (forkingPoint as any).block_number = Number(blockNumber);
  if (alias) (forkingPoint as any).alias = alias;

  // create the specified fork programmatically
  const forkResponse = await axiosOnTenderly.post(
    `${projectUrl}/fork`,
    forkingPoint
  );

  const forkId = forkResponse.data.root_transaction.fork_id;

  console.log(`To use this fork on the aave interface you need to do the following things.

1. Open the browser console on app.aave.com (or a local instance) and enter
--------------
localStorage.setItem('forkEnabled', 'true');
localStorage.setItem('forkBaseChainId', ${networkId});
localStorage.setItem('forkNetworkId', ${forkNetworkId});
localStorage.setItem("forkRPCUrl", "${getForkUrl(forkId)}");
--------------
2. As localStorage is not observable you need to reload now.
3. You can now see & select forked mainnet markets on the ui.
To interact with them you still need to setup your wallet.
To setup your wallet you need to add a network with:
--------------
networkId: ${forkNetworkId}
rpcUrl: ${getForkUrl(forkId)}
--------------
    `);

  if (!keepAlive) {
    listenForInterruptAndKill(forkId);
  }

  // create the provider you can use throughout the rest of your test
  return forkId as string;
}

export async function deleteFork(forkId: string) {
  const { axiosOnTenderly, projectUrl } = getTenderlyClient();
  await axiosOnTenderly.delete(`${projectUrl}/fork/${forkId}`);
}
