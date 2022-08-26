import "dotenv/config";
import { Command } from "commander";
import { createFork, deleteFork } from "./src/tenderly.js";
import {
  createProposal,
  deployPayload,
  passAndExecuteProposal,
} from "./src/governance.js";

const program = new Command();
program
  .name("aave-fok-util")
  .description("CLI to create forks and work with governance")
  .version("0.0.1");

program
  .command("fork")
  .description("Split a string into substrings and display as an array")
  .option("-pi, --proposalId <proposalId>", "proposalId to be executed")
  .option("-pa, --payloadAddress <address>", "payloadAddress to be executed")
  .option(
    "-a, --artifact <path>",
    "path to be payload to be deployed and executed"
  )
  .option("--stayAlive")
  .action(async function (options) {
    let alias = "vanilla-fork";
    if (options.proposalId) {
      alias = `proposalId-${options.proposalId}`;
    } else if (options.payloadAddress) {
      alias = `payloadAddress-${options.payloadAddress}`;
    } else if (options.artifact) {
      alias = `artifact-${options.artifact}`;
    }
    const fork = await createFork({ alias });
    if (options.proposalId) {
      await passAndExecuteProposal({
        proposalId: options.proposalId,
        provider: fork.provider,
      });
    } else if (options.payloadAddress) {
      const proposalId = await createProposal({
        payloadAddress: options.payloadAddress,
      });
      await passAndExecuteProposal({ proposalId: proposalId });
    } else if (options.artifact) {
      const payloadAddress = await deployPayload(options.artifact);
      const proposalId = await createProposal({
        payloadAddress: payloadAddress,
      });
      await passAndExecuteProposal({ proposalId: proposalId });
    }

    console.log(
      "To use this fork on the aave interface type the following commands in the console."
    );
    console.log("--------------");
    console.log(`localStorage.setItem('forkEnabled', 'true');`);
    console.log(`localStorage.setItem('forkBaseChainId', 1);`);
    console.log(`localStorage.setItem('forkNetworkId', 3030);`);
    console.log(`localStorage.setItem("forkRPCUrl", "${fork.forkUrl}");`);
    console.log("--------------");

    if (!options.stayAlive) {
      console.log(
        "warning: the fork will be deleted once this terminal is closed"
      );
      // keep process alive
      process.stdin.resume();

      // delete fork on exit
      process.on("SIGINT", function () {
        console.log("Caught interrupt signal");
        deleteFork(fork.forkId).then((d) => {
          console.log("fork deleted");
          process.exit(0);
        });
      });
    }
  });

program.parse();
