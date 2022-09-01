
import 'dotenv/config';
import {providers, Contract} from "ethers";
import {UiPoolDataProvider, ReserveDataHumanized} from "@aave/contract-helpers";
import lendingRateOracleABI from './abis/lendingRateOracle.json';


const getRate = async (reserve:  ReserveDataHumanized, rateOracleContract: any) => {
  const rate = await rateOracleContract.getMarketBorrowRate(reserve.underlyingAsset);
  return {
    symbol: reserve.symbol,
    rate: rate.toString(),
    stableEnabled: reserve.stableBorrowRateEnabled,
    reateStrategy: reserve.interestRateStrategyAddress
  }
}

const getMarketBorrowRate = async () => {
  const rpcUrl = process.env.RPC_ETHEREUM;
  if (!rpcUrl) throw new Error('Need RPC url');

  const provider = new providers.JsonRpcProvider(rpcUrl);

  // mainnet addresses
  const lendingPoolAddressProvider = '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5';
  const uiPoolDataProvider = '0x548e95Ce38B8cb1D91FD82A9F094F26295840277';
  const lendingRateOracleAddress = '0x8A32f49FFbA88aba6EFF96F45D8BD1D4b3f35c7D';

  const instance = new UiPoolDataProvider({
    provider,
    uiPoolDataProviderAddress: uiPoolDataProvider,
    chainId: 1
  });

  const reserves = await instance.getReservesHumanized({
    lendingPoolAddressProvider,
  });

  const rateOracleContract = new Contract(
    lendingRateOracleAddress,
    lendingRateOracleABI,
    provider
  );

  const ratePromises = reserves.reservesData.map(reserve => getRate(reserve, rateOracleContract));
  const rates = await Promise.all(ratePromises);

  console.log('rates: ', rates);
}

getMarketBorrowRate().then(console.log).catch(console.log);