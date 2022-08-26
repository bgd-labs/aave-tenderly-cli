# Aave fork cli

## Installation

```sh
npm i -g aave-fork-ci
```

## Usage

```sh
# help command
aave-fork-cli --help

# create a fork
aave-fork-cli fork

# keep the fork alive forever
aave-fork-cli fork --stayAlive

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
