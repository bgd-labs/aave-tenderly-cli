#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { createFork, forkIdToForkParams } from "./src/tenderly";
import {
  createProposal,
  deployPayload,
  passAndExecuteProposal,
} from "./src/governance";
import { executeL2Payload } from "./src/l2Gov";
import * as allConfigs from "@bgd-labs/aave-address-book";

interface ForkOptions {
  forkId?: string;
  networkId: string;
  forkNetworkId: string;
  blockNumber?: string;
  alias?: string;
  keepAlive?: boolean;
}
interface GovOptions extends Omit<ForkOptions, "networkId" | "alias"> {
  forkId?: string;
  forkNetworkId: string;
  blockNumber?: string;
  proposalId?: number;
  payloadAddress?: string;
  artifact?: string;
}

interface GovL2Options extends ForkOptions {
  proposalId?: number;
  payloadAddress?: string;
  artifact?: string;
  pool: string;
}

function getName(options: GovOptions) {
  if (options.proposalId) {
    return `proposalId-${options.proposalId}`;
  } else if (options.payloadAddress) {
    return `payloadAddress-${options.payloadAddress}`;
  } else if (options.artifact) {
    return `artifact-${options.artifact}`;
  }
  return "vanilla-fork";
}

const program = new Command();
program
  .name("aave-fok-cli")
  .description("CLI to create forks and work with governance")
  .version("0.0.1");

program
  .command("fork")
  .description("Allows creating forks")
  .option(
    "-fId, --forkId <forkId>",
    "reuse an existing fork instead of creating a new one"
  )
  .option("-b, --blockNumber <block>", "fork at a certain block")
  .option("-nId, --networkId <networkId>", "the networkId to be forked", "1")
  .option(
    "-fnId, --forkNetworkId <networkId>",
    "the networkId for the fork",
    "3030"
  )
  .option(
    "-k, --keepAlive",
    "with this option set the fork won't be deleted automatically"
  )
  .action(async function (options: ForkOptions) {
    await createFork({
      alias: options.alias,
      networkId: options.networkId,
      forkNetworkId: options.forkNetworkId,
      blockNumber: options.blockNumber,
    });
  });

program
  .command("gov")
  .description("Allows creating/executing local/on-chain proposals on forks")
  .option(
    "-fId, --forkId <forkId>",
    "reuse an existing fork instead of creating a new one"
  )
  .option("-b, --blockNumber <block>", "fork at a certain block")
  .option(
    "-fnId, --forkNetworkId <networkId>",
    "the networkId for the fork",
    "3030"
  )
  .option("-pi, --proposalId <proposalId>", "proposalId to be executed")
  .option("-pa, --payloadAddress <address>", "payloadAddress to be executed")
  .option(
    "-a, --artifact <path>",
    "path to be payload to be deployed and executed"
  )
  .option(
    "-k, --keepAlive",
    "with this option set the fork won't be deleted automatically"
  )
  .action(async function (options: GovOptions) {
    const alias = getName(options);
    const forkId =
      options.forkId ||
      (await createFork({
        alias,
        forkNetworkId: options.forkNetworkId,
        blockNumber: options.blockNumber,
      }));
    const fork = forkIdToForkParams({ forkId });

    if (options.proposalId) {
      await passAndExecuteProposal({
        proposalId: options.proposalId,
        provider: fork.provider,
      });
    } else if (options.payloadAddress) {
      const proposalId = await createProposal({
        payloadAddress: options.payloadAddress,
        provider: fork.provider,
      });
      await passAndExecuteProposal({
        proposalId: proposalId,
        provider: fork.provider,
      });
    } else if (options.artifact) {
      const payloadAddress = await deployPayload({
        filePath: options.artifact,
        provider: fork.provider,
      });
      const proposalId = await createProposal({
        provider: fork.provider,
        payloadAddress: payloadAddress,
      });
      await passAndExecuteProposal({
        provider: fork.provider,
        proposalId: proposalId,
      });
    }
  });

program
  .command("govl2")
  .option(
    "-fId, --forkId <forkId>",
    "reuse an existing fork instead of creating a new one"
  )
  .option("-b, --blockNumber <block>", "fork at a certain block")
  .option(
    `-p, --pool, "the pool to use (required to find the acl): ${Object.keys(
      allConfigs
    )
      .filter((c) => (allConfigs as any)[c].ACL_MANAGER)
      .join(",")}`
  )
  .option("-nId, --networkId <networkId>", "the networkId to be forked", "137")
  .option(
    "-fnId, --forkNetworkId <networkId>",
    "the networkId for the fork",
    "3030"
  )
  .option("-pa, --payloadAddress <address>", "payloadAddress to be executed")
  .option(
    "-a, --artifact <path>",
    "path to be payload to be deployed and executed"
  )
  .option(
    "-k, --keepAlive",
    "with this option set the fork won't be deleted automatically"
  )
  .action(async function (options: GovL2Options) {
    const alias = getName(options);
    const forkId =
      options.forkId ||
      (await createFork({
        alias,
        networkId: options.networkId,
        forkNetworkId: options.forkNetworkId,
        blockNumber: options.blockNumber,
      }));
    const fork = forkIdToForkParams({ forkId });

    // TODO: action set Id execution
    if (options.proposalId) {
    } else if (options.payloadAddress) {
      await executeL2Payload({
        payloadAddress: options.payloadAddress,
        provider: fork.provider,
        pool: options.pool,
      });
    } else if (options.artifact) {
      const payloadAddress = await deployPayload({
        filePath: options.artifact,
        provider: fork.provider,
      });
      await executeL2Payload({
        payloadAddress,
        provider: fork.provider,
        pool: options.pool,
      });
    }
  });

program.parse();
