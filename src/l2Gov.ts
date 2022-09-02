import { ContractFactory, providers, BigNumber, utils, Contract } from "ethers";
import { keccak256, toUtf8Bytes, defaultAbiCoder } from "ethers/lib/utils";
import ACL_MANAGER_ABI from "./abis/aclManager.json";

interface DefaultInterface {
  provider: providers.StaticJsonRpcProvider;
}

interface ExecuteL2Payload extends DefaultInterface {
  aclManagerAddress?: string; // TODO: require or sth
  payloadAddress: string;
}

function getACLRoleAddressSlot(_role: string, address: string) {
  const slot = "0x0";
  const role = keccak256(toUtf8Bytes(_role));

  const encodedSlot = defaultAbiCoder.encode(
    ["bytes32", "uint256"],
    [role, slot]
  );

  return keccak256(
    defaultAbiCoder.encode(
      ["address", "bytes32"],
      [address, keccak256(encodedSlot)]
    )
  );
}

export async function executeL2Payload({
  aclManagerAddress = "0xa72636CbcAa8F5FF95B2cc47F3CDEe83F3294a0B",
  payloadAddress,
  provider,
}: ExecuteL2Payload) {
  const address = "0x8f15dee0762dfc571b306a24dc68ca4bd14fd2ac";
  const listingAdminSlot = getACLRoleAddressSlot(
    "ASSET_LISTING_ADMIN",
    address
  );

  await provider.send("tenderly_setStorageAt", [
    aclManagerAddress,
    listingAdminSlot,
    utils.hexZeroPad(BigNumber.from(1).toHexString(), 32),
  ]);

  console.log("added role ASSET_LISTING_ADMIN");

  const riskAdminSlot = getACLRoleAddressSlot("RISK_ADMIN", address);

  await provider.send("tenderly_setStorageAt", [
    aclManagerAddress,
    riskAdminSlot,
    utils.hexZeroPad(BigNumber.from(1).toHexString(), 32),
  ]);

  console.log("added role RISK_ADMIN");

  const payload = new Contract(
    payloadAddress,
    [
      {
        inputs: [],
        name: "execute",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ],
    provider.getSigner()
  );

  await payload.execute();
}
