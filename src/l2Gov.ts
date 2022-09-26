import { providers, BigNumber, utils, Contract } from "ethers";
import { keccak256, toUtf8Bytes, defaultAbiCoder } from "ethers/lib/utils";
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

export async function executeL2Payload({
  aclManagerAddress,
  payloadAddress,
  provider,
}: ExecuteL2Payload) {
  try {
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
      const payloadWithOwner = payload.connect(provider.getSigner(owner));
      await payloadWithOwner.execute();
    } catch (e) {
      await payload.execute();
    }

    console.log("executed payload");
  } catch (e: any) {
    console.log(e.message);
  }
}
