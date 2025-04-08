import { BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import { LastAmbPrice, Platform, Token, Trade, User } from "../../types/schema";
import { getPlatform } from "./platform";
import { MILLION_x18, X18BD } from "./constants";

export function createTrade(
  token: Token,
  trader: User,

  tradeId: string,
  txHash: string,
  amountIn: BigInt,
  amountOut: BigInt,
  liquidity: BigInt,
  isBuy: boolean,
  excludeFee: BigInt,
  balanceToDex: BigInt,
  timestamp: BigInt,
  platform: Platform | null = null
): Trade {
  if (platform === null) platform = getPlatform();

  // Convert amounts to BigDecimal for price calculation
  const amountInDec = isBuy
    ? new BigDecimal(excludeFee).div(X18BD)
    : new BigDecimal(amountIn).div(X18BD);
  const amountOutDec = isBuy
    ? new BigDecimal(amountOut).div(X18BD)
    : new BigDecimal(excludeFee).div(X18BD);

  // Calculate the price
  const price = isBuy
    ? amountInDec.div(amountOutDec)
    : amountOutDec.div(amountInDec);

  // Calculate the price in USDC
  let priceUSDC = BigDecimal.fromString("0");
  const lastAmbPrice = LastAmbPrice.load("1");
  if (lastAmbPrice === null) {
    priceUSDC = BigDecimal.fromString("0");
  } else {
    priceUSDC = price.times(lastAmbPrice.price);
  }

  // Create a new trade entity
  const trade = new Trade(tradeId);
  trade.token = token.id;
  trade.user = trader.id;
  trade.hash = txHash;
  trade.amount = isBuy ? amountOut : amountIn;
  trade.amountAmb = isBuy ? amountInDec : amountOutDec;
  trade.amountUSDC = isBuy
    ? amountOutDec.times(priceUSDC)
    : amountInDec.times(priceUSDC);
  trade.price = price;
  trade.priceUSDC = priceUSDC;
  trade.fees = excludeFee;
  trade.timestamp = timestamp;
  trade.isBuy = isBuy;

  //Check if is one million amber inside the pool
  if (liquidity.gt(MILLION_x18)) {
    log.info("One million amber reached, token: {}, liquidity: {}", [
      token.id,
      liquidity.toString(),
    ]);
    token.reachedOneMillions = true;
    token.reachedOneMillionsAt = timestamp;
  } else {
    log.info("One million amber not reached, token: {}, liquidity: {}", [
      token.id,
      liquidity.toString(),
    ]);
    token.reachedOneMillions = false;
    token.reachedOneMillionsAt = BigInt.fromI32(0);
  }

  // Check if token is on half way to dex
  if (liquidity.gt(balanceToDex.div(BigInt.fromI32(2)))) {
    token.reachedHalfWayToDex = true;
    token.reachedHalfWayToDexAt = timestamp;
  } else {
    token.reachedHalfWayToDex = false;
    token.reachedHalfWayToDexAt = BigInt.fromI32(0);
  }

  // Update liquidity
  token.liquidity = liquidity;

  // Update token metrics
  token.totalTokenSold = isBuy
    ? token.totalTokenSold.plus(amountOut)
    : token.totalTokenSold.minus(excludeFee);
  token.totalAmbSpend = isBuy
    ? token.totalAmbSpend.plus(excludeFee)
    : token.totalAmbSpend.minus(amountOut);

  // Update platform metrics
  platform.totalAmb = isBuy
    ? platform.totalAmb.plus(excludeFee)
    : platform.totalAmb.minus(amountOut);

  // Update total trades for token, trader and platform
  trader.totalTrades = trader.totalTrades.plus(BigInt.fromI32(1));
  token.totalTrades = token.totalTrades.plus(BigInt.fromI32(1));
  platform.totalTrades = platform.totalTrades.plus(BigInt.fromI32(1));

  trade.save();
  trader.save();
  token.save();
  platform.save();
  return trade;
}
