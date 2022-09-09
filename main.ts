#!/usr/bin/env node

import "dotenv/config";
import inquirer from "inquirer";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { ChainId } from "@aave/contract-helpers";
import {
  createFork,
  forkIdToForkParams,
  getForkParameters,
} from "./src/tenderly";
import {
  createProposal,
  deployPayload,
  passAndExecuteProposal,
} from "./src/governance";
import { executeL2Payload } from "./src/l2Gov";
import * as allConfigs from "@bgd-labs/aave-address-book";
import { ADDRCONFIG } from "dns";

inquirer.registerPrompt("fuzzypath", require("inquirer-fuzzy-path"));

type NewFork = {
  forkType: "new";
};

type ExistingFork = {
  forkType: "existing";
  forkId: string;
};

type ForkOptions = NewFork | ExistingFork;

type CommonOptions = {
  networkName?: keyof typeof ChainId;
  networkId: ChainId;
  blockNumber?: string;
  forkNetworkId: string;
  //
  enterProposalId: boolean;
  proposalId?: number;
  enterPayloadAddress: boolean;
  payloadAddress?: string;
  enterArtifactPath: boolean;
  artifactPath?: string;
  //
  pool?: string;
  aclManagerAddress?: string;
};

type Options = ForkOptions & CommonOptions;

interface SharedQuestion {
  // shared
  type: "string" | "list" | "confirm" | "fuzzypath" | "number";
  default?: string;
  choices?: string[] | number[] | ((args: Options) => string[]);
  when?:
    | ((args: Options) => boolean | undefined)
    | ((args: Options) => Promise<boolean | undefined>);
  inquirerOnly?: boolean;
  message: string;
  itemType?: "file";
  transformer?: any;
}

interface InquirerQuestion extends SharedQuestion {
  // inquirer
  inquirerOnly: true;
}

interface YargsQuestion extends SharedQuestion {
  // yargs
  demandOption?: boolean;
  describe: string;
  coerce?:
    | ((args: Options) => Promise<Partial<Options>>)
    | ((args: Options) => Partial<Options>);
}

// The questions are split in two so we can async fetch networkId and similar implicit values in between
const initialQuestions: { [key: string]: InquirerQuestion | YargsQuestion } = {
  // determine if we want to create a new fork or reuse existing one
  forkType: {
    // inquirer
    message: "Want to use existing fork or create a new one?",
    // shared
    type: "list",
    default: "new",
    choices: ["new", "existing"],
    inquirerOnly: true,
  },
  forkId: {
    message: "Enter forkId",
    describe: "Existing fork id",
    type: "string",
    when: (args) => args.forkType === "existing",
  },
};

const questions: { [key: string]: InquirerQuestion | YargsQuestion } = {
  ...initialQuestions,
  // config to setup a custom fork
  networkName: {
    message: "Select network to fork",
    describe: "Network to be forked",
    type: "list",
    choices: [
      "mainnet",
      "optimism",
      "polygon",
      "fantom",
      "arbitrum_one",
      "avalanche",
      "harmony",
    ],
    inquirerOnly: true,
    when: (args) => args.forkType === "new",
  },
  networkId: {
    message: "Select network to fork",
    describe: "Network to be forked",
    type: "list",
    choices: [
      ChainId.mainnet,
      ChainId.optimism,
      ChainId.polygon,
      ChainId.fantom,
      ChainId.arbitrum_one,
      ChainId.avalanche,
      ChainId.harmony,
    ],
    when: (args) => {
      // little hack to implicitly set networkId
      if (args.networkName) args.networkId = ChainId[args.networkName];
      return args.forkType === "new" && !args.networkName;
    },
    demandOption: true,
  },
  blockNumber: {
    message: "Select the blockNumber to fork",
    describe: "Blocknumber to fork",
    type: "string",
    default: "latest",
    when: (args) => args.forkType === "new",
  },
  forkNetworkId: {
    message: "Select the networkId of the fork",
    describe: "NetworkId used by the fork",
    type: "string",
    default: "3030",
    when: (args) => args.forkType === "new",
  },
  enterProposalId: {
    message: "Do you want to execute a pending proposalId?",
    inquirerOnly: true,
    type: "confirm",
    when: (args) => Number(args.networkId) === ChainId.mainnet,
  },
  proposalId: {
    message: "Existing proposalId to execute",
    describe: "The proposalId to execute",
    type: "number",
    when: (args) =>
      args.enterProposalId === true &&
      Number(args.networkId) === ChainId.mainnet,
  },
  enterPayloadAddress: {
    message: "Do you want to execute a deployed proposal payload?",
    inquirerOnly: true,
    type: "confirm",
    when: (args) => !args.proposalId,
  },
  payloadAddress: {
    message: "Enter the deployed payload address",
    describe: "The payloadAddress to execute",
    type: "string",
    when: (args) => args.enterPayloadAddress === true && !args.proposalId,
  },
  enterArtifactPath: {
    message: "Do you want to deploy and execute a local payload?",
    inquirerOnly: true,
    type: "confirm",
    when: (args) => !args.proposalId && !args.payloadAddress,
  },
  artifactPath: {
    type: "fuzzypath",
    itemType: "file",
    message: "Path to artifact",
    describe: "The path to the artifact to execute",
    when: (args) =>
      args.enterArtifactPath === true &&
      !args.proposalId &&
      !args.payloadAddress,
  },
  // get the correct acl
  pool: {
    type: "list",
    message: "Pool address of the target pool",
    describe:
      "The pool address targeted in the payload (required to pick the proper acl)",
    inquirerOnly: true,
    choices: (args) => {
      return Object.keys(allConfigs).filter(
        (key) => (allConfigs as any)[key].CHAIN_ID === args.networkId
      );
    },
    when: (args) =>
      !!(
        (args.artifactPath || args.proposalId || args.payloadAddress) &&
        Number(args.networkId) !== ChainId.mainnet
      ),
  },
  aclManagerAddress: {
    message: "ACL manager address of the target pool",
    describe: "ACL manager address",
    type: "string",
    when: (args) =>
      !!(
        (args.artifactPath || args.proposalId || args.payloadAddress) &&
        !args.pool &&
        Number(args.networkId) !== ChainId.mainnet
      ),
  },
};

function getPrompts(options: {
  [key: string]: InquirerQuestion | YargsQuestion;
}) {
  return Object.entries(options).map(
    ([
      name,
      { choices, default: _default, message, type, when, transformer },
    ]) => ({
      choices,
      default: _default,
      message,
      name,
      type,
      when,
      transformer,
    })
  );
}

function getOptions(options: {
  [key: string]: InquirerQuestion | YargsQuestion;
}) {
  return Object.entries(options as { [key: string]: YargsQuestion })
    .filter(([key, value]) => !value.inquirerOnly)
    .reduce(
      (
        previous,
        [
          name,
          { choices, default: _default, demandOption, describe, type, coerce },
        ]
      ) => {
        previous[name] = {
          choices,
          default: _default,
          demandOption,
          describe,
          type,
          coerce,
        };
        return previous;
      },
      {} as any
    );
}

function getName(options: Options) {
  if (options.proposalId) {
    return `proposalId-${options.proposalId}`;
  } else if (options.payloadAddress) {
    return `payloadAddress-${options.payloadAddress}`;
  } else if (options.artifactPath) {
    return `artifact-${options.artifactPath}`;
  }
  return "vanilla-fork";
}

(async () => {
  const hideBinArgv = hideBin(process.argv);

  if (!hideBinArgv.length) {
    // figure out is using existing or new fork
    const initialAnswers = await inquirer.prompt(getPrompts(initialQuestions));
    if (initialAnswers.forkType === "existing") {
      // seed parameters on existing fork
      const params = await getForkParameters({ forkId: initialAnswers.forkId });
      initialAnswers.blockNumber = params.blockNumber;
      initialAnswers.forkNetworkId = params.forkNetworkId;
      initialAnswers.networkId = params.networkId;
    }
    const answers = await inquirer.prompt(
      getPrompts(questions),
      initialAnswers
    );

    Object.entries(answers).forEach(([key, value]) => {
      value && hideBinArgv.push(`--${key}`, value as any);
    });
  }

  const argv = (await yargs(hideBinArgv)
    .usage("Usage: npx $0")
    .options(getOptions(questions))
    .parseAsync()) as unknown as Options;

  const alias = getName(argv);
  const forkId =
    (argv as any).forkId ||
    (await createFork({
      alias,
      forkNetworkId: argv.forkNetworkId,
      networkId: argv.networkId,
      blockNumber: argv.blockNumber === "latest" ? undefined : argv.blockNumber,
    }));
  const fork = forkIdToForkParams({ forkId });
  const aclManagerAddress = argv.pool
    ? (allConfigs as any)[argv.pool].ACL_MANAGER
    : argv.aclManagerAddress;

  if (argv.proposalId) {
    await passAndExecuteProposal({
      proposalId: Number(argv.proposalId),
      provider: fork.provider,
    });
  } else if (argv.payloadAddress) {
    if (Number(argv.networkId) === ChainId.mainnet) {
      const proposalId = await createProposal({
        payloadAddress: argv.payloadAddress,
        provider: fork.provider,
      });
      await passAndExecuteProposal({
        proposalId: proposalId,
        provider: fork.provider,
      });
    } else {
      await executeL2Payload({
        payloadAddress: argv.payloadAddress,
        provider: fork.provider,
        aclManagerAddress,
      });
    }
  } else if (argv.artifactPath) {
    const payloadAddress = await deployPayload({
      filePath: argv.artifactPath,
      provider: fork.provider,
    });
    if (Number(argv.networkId) === ChainId.mainnet) {
      const proposalId = await createProposal({
        provider: fork.provider,
        payloadAddress: payloadAddress,
      });
      await passAndExecuteProposal({
        provider: fork.provider,
        proposalId: proposalId,
      });
    } else {
      await executeL2Payload({
        payloadAddress,
        provider: fork.provider,
        aclManagerAddress,
      });
    }
  }
})();
