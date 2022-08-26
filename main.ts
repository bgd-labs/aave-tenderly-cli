#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { createFork, deleteFork, forkIdToForkParams } from "./src/tenderly";
import {
  createProposal,
  deployPayload,
  passAndExecuteProposal,
} from "./src/governance";

interface Options {
  forkId?: string;
  forkNetworkId: string;
  blockNumber?: string;
  proposalId?: number;
  payloadAddress?: string;
  artifact?: string;
  keepAlive?: boolean;
}

function getName(options: Options) {
  if (options.proposalId) {
    return `proposalId-${options.proposalId}`;
  } else if (options.payloadAddress) {
    return `payloadAddress-${options.payloadAddress}`;
  } else if (options.artifact) {
    return `artifact-${options.artifact}`;
  }
  return "vanilla-fork";
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

const program = new Command();
program
  .name("aave-fok-cli")
  .description("CLI to create forks and work with governance")
  .version("0.0.1");

program
  .command("fork")
  .description("Split a string into substrings and display as an array")
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
  .action(async function (options: Options) {
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

    console.log(
      "To use this fork on the aave interface type the following commands in the console."
    );
    console.log("--------------");
    console.log(`localStorage.setItem('forkEnabled', 'true');`);
    console.log(`localStorage.setItem('forkBaseChainId', 1);`);
    console.log(
      `localStorage.setItem('forkNetworkId', ${options.forkNetworkId});`
    );
    console.log(`localStorage.setItem("forkRPCUrl", "${fork.forkUrl}");`);
    console.log("--------------");

    /**
     * Don't delete forks that were created externally or set to stay alive
     */
    if (!options.keepAlive && !options.forkId)
      listenForInterruptAndKill(fork.forkId);
  });

program.parse();
