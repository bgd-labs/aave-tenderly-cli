# Aave fork cli

## Installation

```sh
npm i -g aave-fork-ci
```

## Setup env

The tooling relies on tenderly. Therefore you need to setup your console environment accordingly.

```sh
export TENDERLY_ACCESS_TOKEN=tenderly_access_token
export TENDERLY_PROJECT=tenderly_project
export TENDERLY_ACCOUNT=tenderly_account
```

To store the secrets across sessions you might want to add them to `.bashrc` or `.profile`.

## Usage

```sh
# help command - will also show short commands not listed here
aave-fork-cli --help

# create a fork
aave-fork-cli fork

# keep the fork alive forever
aave-fork-cli fork --keepAlive

# fork at a specific block (default is latest)
aave-fork-cli fork --block 15415636

# adjust the networkId of the created fork (defaults to 3030)
aave-fork-cli fork --forkNetworkId 42

# execute a pending proposal
aave-fork-cli fork --proposalId 95

# create a proposal with existing payload & execute
aave-fork-cli fork --payloadAddress 0x0...

# deploy a payload, create and execute the proposal
aave-fork-cli fork --artifact ./out/Contract.sol/Contract.json
```

## Local Development

```sh
npm run publish:local
```
