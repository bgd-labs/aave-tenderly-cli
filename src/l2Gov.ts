import { providers, BigNumber, utils, Contract } from "ethers";
import {
  keccak256,
  toUtf8Bytes,
  defaultAbiCoder,
  formatBytes32String,
} from "ethers/lib/utils";
import * as allConfigs from "@bgd-labs/aave-address-book";

interface DefaultInterface {
  provider: providers.StaticJsonRpcProvider;
}

interface ExecuteL2Payload extends DefaultInterface {
  payloadAddress: string;
  pool: string;
}

function getPoolAdminSlot() {
  const slot = "0x2";
  const role = formatBytes32String("POOL_ADMIN");
  const encodedSlot = defaultAbiCoder.encode(
    ["bytes32", "uint256"],
    [role, slot]
  );
  return keccak256(encodedSlot);
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
  payloadAddress,
  provider,
  pool,
}: ExecuteL2Payload) {
  const config = allConfigs[pool as keyof typeof allConfigs];
  const aclManagerAddress = (config as typeof allConfigs.AaveV3Optimism)
    .ACL_MANAGER;
  const isV2 = !aclManagerAddress;
  try {
    if (aclManagerAddress) {
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

      const poolAdminSlot = getACLRoleAddressSlot("POOL_ADMIN", payloadAddress);
      await provider.send("tenderly_setStorageAt", [
        aclManagerAddress,
        poolAdminSlot,
        utils.hexZeroPad(BigNumber.from(1).toHexString(), 32),
      ]);
      console.log("added role POOL_ADMIN");
    }
    const payload = new Contract(
      payloadAddress,
      [
        {
          inputs: [],
          name: "owner",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
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

    // sometimes payloads use ownable and onlyOwner modifier on `execute`
    // therefore we check if we can fetch owner and set the owner as signer
    try {
      const owner = await payload.owner();
      if (isV2) {
        console.log("### WARNING ###");
        console.log("Cannot simulate l2 proposals with owner guard");
      }
      const payloadWithOwner = payload.connect(provider.getSigner(owner));
      await payloadWithOwner.execute();
    } catch (e) {
      if (isV2) {
        const adminSlot = getPoolAdminSlot();
        await provider.send("tenderly_setStorageAt", [
          config.POOL_ADDRESSES_PROVIDER,
          adminSlot,
          utils.hexZeroPad(payloadAddress, 32),
        ]);
        await payload.execute();
      } else {
        await payload.execute();
      }
    }

    console.log("executed payload");
  } catch (e: any) {
    console.log(e.message);
  }
}
