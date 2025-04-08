import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Platform, User } from "../../types/schema";
import { getPlatform } from "./platform";

export function createUser(
  userAddress: Address,
  platform: Platform | null = null,
  isInsider: boolean = false,
  totalTokensCreated: BigInt = BigInt.fromI32(0),
  totalTrades: BigInt = BigInt.fromI32(0)
): User {
  if (platform === null) platform = getPlatform();
  const user = new User(userAddress.toHexString());
  user.totalTokensCreated = totalTokensCreated;
  user.totalTrades = totalTrades;
  user.isInsider = isInsider;
  platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1));
  user.save();
  platform.save();
  return user;
}