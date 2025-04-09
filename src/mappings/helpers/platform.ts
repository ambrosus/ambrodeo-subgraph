import { BigInt } from "@graphprotocol/graph-ts";
import { Platform } from "../../types/schema";

export function getPlatform(): Platform {
  let platform = Platform.load("1");
  if (platform === null) {
    platform = new Platform("1");
    platform.totalTokens = BigInt.fromI32(0);
    platform.totalUsers = BigInt.fromI32(0);
    platform.totalTrades = BigInt.fromI32(0);
    platform.totalAmb = BigInt.fromI32(0);
    platform.totalTokensOnDex = BigInt.fromI32(0);
    platform.save();
  }
  return platform;
}