import { Address, Bytes, BigInt, BigDecimal } from "@graphprotocol/graph-ts";
import { Platform, Token, User } from "../../types/schema";
import { getPlatform } from "./platform";

export function createToken(
  creator: User,
  tokenAddress: Address,
  name: string,
  symbol: string,
  totalSupply: BigInt,
  createdAt: BigInt,
  data: Bytes,
  platform: Platform | null = null
): Token {
  if (platform === null) platform = getPlatform();
  const token = new Token(tokenAddress.toHexString());
  token.creator = creator.id;
  token.name = name;
  token.nameLowerCase = name.toLowerCase();
  token.symbol = symbol;
  token.symbolLowerCase = symbol.toLowerCase();
  token.createdAt = createdAt;
  token.data = data;
  token.totalSupply = totalSupply;
  token.lastPrice = BigDecimal.zero();
  token.lastPriceUpdate = createdAt;
  token.onDex = false;
  token.reachedOneMillions = false;
  token.reachedHalfWayToDex = false;
  token.liquidity = BigInt.fromI32(0);
  token.totalTokenLiquidity = BigInt.fromI32(0);
  token.totalTokenSold = BigInt.fromI32(0);
  token.totalAmbSpend = BigInt.fromI32(0);
  token.totalTrades = BigInt.fromI32(0);
  token.totalHolders = BigInt.fromI32(0);
  token.save();
  creator.totalTokensCreated = creator.totalTokensCreated.plus(
    BigInt.fromI32(1)
  );
  platform.totalTokens = platform.totalTokens.plus(BigInt.fromI32(1));
  creator.save();
  platform.save();
  return token;
}