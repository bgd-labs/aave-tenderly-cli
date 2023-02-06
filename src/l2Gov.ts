import { providers, Contract } from "ethers";
import * as allConfigs from "@bgd-labs/aave-address-book";

// https://github.com/bgd-labs/aave-helpers/blob/master/src/GovHelpers.sol#L179
const mockExecutorBytes =
  "0x608060405234801561001057600080fd5b506004361061002b5760003560e01c80634b64e49214610030575b600080fd5b61004361003e366004610120565b610045565b005b60408051600481526024810182526020810180516001600160e01b0316631851865560e21b17905290516000916001600160a01b038416916100879190610150565b600060405180830381855af49150503d80600081146100c2576040519150601f19603f3d011682016040523d82523d6000602084013e6100c7565b606091505b505090508061011c5760405162461bcd60e51b815260206004820152601960248201527f50524f504f53414c5f455845435554494f4e5f4641494c454400000000000000604482015260640160405180910390fd5b5050565b60006020828403121561013257600080fd5b81356001600160a01b038116811461014957600080fd5b9392505050565b6000825160005b818110156101715760208186018101518583015201610157565b81811115610180576000828501525b50919091019291505056fea2646970667358221220b5e76617250f070df5d6bc01dcf608005afb0c19aa2776724a1b25684f561c4664736f6c634300080a0033";
const MOCK_EXECUTOR_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "payload",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
    name: "execute",
  },
];

interface DefaultInterface {
  provider: providers.StaticJsonRpcProvider;
}

interface ExecuteL2Payload extends DefaultInterface {
  payloadAddress: string;
  pool: string;
}

export async function executeL2Payload({
  payloadAddress,
  provider,
  pool,
}: ExecuteL2Payload) {
  const config = allConfigs[pool as keyof typeof allConfigs];
  const executor =
    (config as typeof allConfigs.AaveV3Optimism).ACL_ADMIN ||
    (config as typeof allConfigs.AaveV2Polygon).POOL_ADMIN;
  try {
    await provider.send("tenderly_setCode", [executor, mockExecutorBytes]);
    const mockExecutor = new Contract(
      executor,
      MOCK_EXECUTOR_ABI,
      provider.getSigner()
    );
    console.log("replaced executor");

    await mockExecutor.execute(payloadAddress);
    console.log("executed payload");
  } catch (e: any) {
    console.log(e.message);
  }
}
