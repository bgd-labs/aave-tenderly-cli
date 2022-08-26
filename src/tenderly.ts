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

export function forkIdToForkParams({ forkId }: { forkId: string }) {
  const forkUrl = `https://rpc.tenderly.co/fork/${forkId}`;
  return {
    forkUrl,
    provider: new providers.StaticJsonRpcProvider(forkUrl),
    forkId,
  };
}

export async function createFork({
  alias,
  forkNetworkId,
}: {
  alias: string;
  forkNetworkId: string;
}) {
  const { axiosOnTenderly, projectUrl } = getTenderlyClient();
  const forkingPoint = {
    network_id: 1,
    chain_config: { chain_id: Number(forkNetworkId) },
    alias,
  };
  // create the specified fork programmatically
  const forkResponse = await axiosOnTenderly.post(
    `${projectUrl}/fork`,
    forkingPoint
  );

  const forkId = forkResponse.data.root_transaction.fork_id;

  // create the provider you can use throughout the rest of your test
  return forkId as string;
}

export async function deleteFork(forkId: string) {
  const { axiosOnTenderly, projectUrl } = getTenderlyClient();
  await axiosOnTenderly.delete(`${projectUrl}/fork/${forkId}`);
}
