import axios from "axios";
import ethers from "ethers";

// an axios instance to make requests to Tenderly, for re-use purposes
const axiosOnTenderly = axios.create({
  baseURL: "https://api.tenderly.co/api/v1",
  headers: {
    "X-Access-Key": process.env.TENDERLY_ACCESS_KEY || "",
    "Content-Type": "application/json",
  },
});

const TENDERLY_USER = process.env.TENDERLY_USER;
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT;

const projectUrl = `account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}`;

export async function createFork({ alias }: { alias: string }) {
  const forkingPoint = {
    network_id: 1,
    chain_config: { chain_id: 3030 },
    alias,
  };
  // create the specified fork programmatically
  const forkResponse = await axiosOnTenderly.post(
    `${projectUrl}/fork`,
    forkingPoint
  );

  const forkId = forkResponse.data.root_transaction.fork_id;

  // create the provider you can use throughout the rest of your test
  const forkUrl = `https://rpc.tenderly.co/fork/${forkId}`;
  return {
    forkUrl,
    provider: new ethers.providers.StaticJsonRpcProvider(forkUrl),
    forkId,
  };
}

export async function deleteFork(forkId: string) {
  await axiosOnTenderly.delete(
    `account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/fork/${forkId}`
  );
}
