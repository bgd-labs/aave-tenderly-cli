#!/usr/bin/env node

import "dotenv/config";
import inquirer, { Question } from "inquirer";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { ChainId } from "@aave/contract-helpers";
import {
  createFork,
  forkIdToForkParams,
  fundAccount,
  getForkParameters,
} from "./src/tenderly";
import {
  createCalldataProposal,
  createProposal,
  deployPayload,
  passAndExecuteProposal,
} from "./src/governance";
import { executeL2Payload } from "./src/l2Gov";

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
  forkId?: string;
  forkLabel?: string;
  //
  enterProposalId: boolean;
  proposalId?: number;
  enterPayloadAddress: boolean;
  payloadAddress?: string;
  enterArtifactPath: boolean;
  artifactPath?: string;
  enterCalldata: boolean;
  calldata?: string;
  //
  userAddress?: string;
  keepAlive?: boolean | string;
};

type Options = ForkOptions & CommonOptions;

interface SharedQuestion {
  // shared
  type: "string" | "list" | "confirm" | "fuzzypath" | "number";
  default?: string | number | boolean;
  // additional property for option in --help which requires static options
  staticChoices?: string[] | number[];
  choices?: string[] | number[] | ((args: Options) => string[]);
  when?:
    | ((args: Options) => boolean | undefined)
    | ((args: Options) => Promise<boolean | undefined>);
  inquirerOnly?: boolean;
  message: string;
  itemType?: "file";
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
    describe: "Reuse existing fork id",
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
    default: ChainId.mainnet,
    when: (args) => {
      // little hack to implicitly set networkId
      if (args.networkName) args.networkId = ChainId[args.networkName];
      return args.forkType === "new" && !args.networkName;
    },
  },
  blockNumber: {
    message: "Select the blockNumber to fork off",
    describe: "Blocknumber to fork off",
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
    describe: "The proposal id to execute",
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
    describe: "The payload address to execute",
    type: "string",
    when: (args) => args.enterPayloadAddress === true,
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
    message: "Path to artifact.json",
    describe: "The path to the artifact to execute",
    when: (args) => args.enterArtifactPath === true,
  },
  enterCalldata: {
    message: "Do you want to create and execute raw calldata?",
    inquirerOnly: true,
    type: "confirm",
    when: (args) =>
      !args.proposalId && !args.payloadAddress && !args.artifactPath,
  },
  calldata: {
    message: "Enter the proposal creation calldata",
    describe: "Proposal creation calldata",
    type: "string",
    when: (args) => args.enterCalldata === true,
  },
  userAddress: {
    message:
      "Enter an address you want to fund with 1000 native currency on the fork?",
    describe: "Address to fund with 1000 of native currency",
    type: "string",
  },
  forkLabel: {
    message:
      "Enter label to be used on tenderly (keep empty for autogenerated)",
    describe: "Label will be used in tenderly to differentiate between forks",
    type: "string",
    when: (args) => args.forkType === "new",
  },
  keepAlive: {
    message: "Should the fork be kept alive after terminal is closed?",
    describe: "Keep the fork alive after this session",
    type: "confirm",
    default: false,
    when: (args) => args.forkType === "new",
  },
};

function getPrompts(options: {
  [key: string]: InquirerQuestion | YargsQuestion;
}) {
  return Object.entries(options).map(
    ([name, { choices, default: _default, message, type, when }]) => ({
      choices,
      default: _default,
      message,
      name,
      type,
      when,
    })
  );
}

function typeToYargsType(type: SharedQuestion["type"]) {
  if (type === "fuzzypath") return "string";
  if (type === "confirm") return "boolean";
  return type;
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
          {
            staticChoices,
            choices,
            default: _default,
            demandOption,
            describe,
            type,
            coerce,
          },
        ]
      ) => {
        previous[name] = {
          choices: staticChoices || choices || undefined,
          default: _default,
          demandOption,
          describe,
          type: typeToYargsType(type),
          coerce,
        };
        return previous;
      },
      {} as any
    );
}

function getName(options: Options) {
  const unix = Math.floor(new Date().getTime() / 1000);
  if (options.forkLabel) {
    return `${unix}-${options.forkLabel}`;
  } else if (options.proposalId) {
    return `${unix}-proposalId-${options.proposalId}`;
  } else if (options.payloadAddress) {
    return `${unix}-payloadAddress-${options.payloadAddress}`;
  } else if (options.artifactPath) {
    return `${unix}-artifact-${options.artifactPath.replace(/^.*[\\\/]/, "")}`;
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
      console.log(params);
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

  let argv = (await yargs(hideBinArgv)
    .usage("Usage: npx $0")
    .options(getOptions(questions))
    .parseAsync()) as unknown as Options;

  const alias = getName(argv);
  const forkId =
    (argv as any).forkId ||
    (await createFork({
      alias,
      forkNetworkId: argv.forkNetworkId,
      networkId: String(argv.networkId),
      blockNumber: argv.blockNumber === "latest" ? undefined : argv.blockNumber,
      keepAlive: argv.keepAlive === true || argv.keepAlive === "true",
    }));
  const fork = forkIdToForkParams({ forkId });

  if (argv.proposalId) {
    await passAndExecuteProposal({
      proposalId: Number(argv.proposalId),
      provider: fork.provider,
    });
  } else if (argv.calldata) {
    // for now only supports mainnet
    if (Number(argv.networkId) === ChainId.mainnet) {
      const proposalId = await createCalldataProposal({
        calldata: argv.calldata,
        provider: fork.provider,
      });
      await passAndExecuteProposal({
        proposalId: proposalId,
        provider: fork.provider,
      });
    }
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
        networkId: argv.networkId,
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
        networkId: argv.networkId,
      });
    }
  }

  if (argv.forkId && !argv.networkId) {
    const params = await getForkParameters({
      forkId: argv.forkId,
    });
    argv = { ...argv, ...params };
  }

  if (argv.userAddress) {
    await fundAccount(forkId, argv.userAddress);
  }

  console.log(`To use this fork on the aave interface you need to do the following things.

1. Open the browser console on app.aave.com (or a local instance) and enter
--------------
localStorage.setItem('forkEnabled', 'true');
localStorage.setItem('forkBaseChainId', ${argv.networkId});
localStorage.setItem('forkNetworkId', ${argv.forkNetworkId});
localStorage.setItem("forkRPCUrl", "${fork.forkUrl}");
--------------
2. As localStorage is not observable you need to reload now.
3. You can now see & select forked mainnet markets on the ui.
To interact with them you still need to setup your wallet.
To setup your wallet you need to add a network with:
--------------
networkId: ${argv.networkId}
rpcUrl: ${fork.forkUrl}
--------------
    `);
})();
