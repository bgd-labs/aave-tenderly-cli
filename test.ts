import inquirer from "inquirer";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { ChainId, ChainIdToNetwork } from "@aave/contract-helpers";

type ForkOptions =
  | {
      forkType: "new";
      networkId: string;
      blockNumber?: string;
      forkNetworkId: string;
    }
  | {
      forkType: "existing";
      forkId: string;
    };

type CommonOptions = {
  proposalId: string;
};

type Options = ForkOptions & CommonOptions;

interface Question {
  // inquirer
  message: string;
  // yargs
  demandOption?: boolean;
  describe: string;
  coerce?:
    | ((args: Options) => Promise<Partial<Options>>)
    | ((args: Options) => Partial<Options>);
  // shared
  type: "string" | "list";
  default?: string;
  choices?: string[];
  when?: (args: Options) => boolean;
}

const questions: { [key: string]: Question } = {
  forkType: {
    // inquirer
    message: "Want to use existing fork or create a new one?",
    // yargs
    demandOption: true,
    describe: "Fork type",
    // shared
    type: "list",
    default: "new",
    choices: ["new", "existing"],
  },
  forkId: {
    message: "Enter forkId",
    describe: "Existing fork id",
    type: "string",
    when: (args) => args.forkType === "existing",
    coerce: async (args) => {
      return {
        networkId: "1000",
      };
    },
  },
  networkId: {
    message: "Select network to fork",
    describe: "Network to be forked",
    type: "list",
    choices: Object.values(ChainIdToNetwork) as string[],
    when: (args) => args.forkType === "new",
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
  proposalId: {
    message:
      "Do you want to execute a pending proposalId (enter proposalId if yes)?",
    describe: "The proposalId to execute",
    type: "string",
    when: (args) => args.forkType === "new" && args.networkId === "mainnet",
  },
  payloadAddress: {
    message:
      "Do you want to execute a deployed payload (enter address if yes)?",
    describe: "The payloadAddress to execute",
    type: "string",
    default: "no",
    when: (args) => args.forkType === "new" && args.proposalId === "",
  },
};

function getPrompts(options: typeof questions) {
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

function getOptions(options: typeof questions) {
  return Object.entries(options).reduce(
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

(async () => {
  const hideBinArgv = hideBin(process.argv);

  if (!hideBinArgv.length) {
    const answers = await inquirer.prompt(getPrompts(questions));
    Object.entries(answers).forEach(([key, value]) => {
      value && hideBinArgv.push(`--${key}`, value as any);
    });
  }

  const argv = await yargs(hideBinArgv)
    .usage("Usage: npx $0")
    .options(getOptions(questions))
    .parseAsync();

  console.log(argv);
})();
