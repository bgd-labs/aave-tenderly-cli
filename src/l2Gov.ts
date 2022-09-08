import { providers, BigNumber, utils, Contract } from "ethers";
import { keccak256, toUtf8Bytes, defaultAbiCoder } from "ethers/lib/utils";
import * as allConfigs from "@bgd-labs/aave-address-book";

interface DefaultInterface {
  provider: providers.StaticJsonRpcProvider;
}

interface ExecuteL2Payload extends DefaultInterface {
  aclManagerAddress: string;
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

function getAclForPool(pool: string) {
  const config = Object.values(allConfigs).find(
    (config) => config.POOL === pool
  ) as { ACL_MANAGER: string };
  if (!config) throw new Error("could not find pool");
  if (!config.ACL_MANAGER)
    throw new Error("only v3 pools with ACL_MANAGER supported right now");
  return config.ACL_MANAGER;
}

export async function executeL2Payload({
  aclManagerAddress,
  payloadAddress,
  provider,
}: ExecuteL2Payload) {
  const listingAdminSlot = getACLRoleAddressSlot(
    "ASSET_LISTING_ADMIN",
    payloadAddress
  );

  await provider.send("tenderly_setStorageAt", [
    aclManagerAddress,
    listingAdminSlot,
    utils.hexZeroPad(BigNumber.from(1).toHexString(), 32),
  ]);

  console.log("added role ASSET_LISTING_ADMIN");

  const riskAdminSlot = getACLRoleAddressSlot("RISK_ADMIN", payloadAddress);

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
  console.log("executed payload");
}
