import { Address } from "@graphprotocol/graph-ts";
import { Token as TokenContract } from "../../types/templates/Token/Token";
import { Holder, User } from "../../types/schema";
import { createUser } from "./user";

export function createHolder(
  userAddress: Address,
  tokenContract: TokenContract
): Holder {
  let user = User.load(userAddress.toHexString());
  if (user === null) user = createUser(userAddress, null, false);
  const tokenAddress = tokenContract._address.toHexString();
  const holderId = tokenAddress + "-" + userAddress.toHexString();
  const holder = new Holder(holderId);
  holder.token = tokenAddress;
  holder.user = user.id;
  holder.balance = tokenContract.balanceOf(userAddress);
  user.save();
  holder.save();
  return holder;
}