import { Token, Holder, User, Platform } from '../types/schema'
import {  BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../types/templates/Token/Token'
import { log } from '@graphprotocol/graph-ts'

export function handleTransfer(event: Transfer): void {
  let platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }
  
  let token = Token.load(event.address.toHexString())
  if (!token) return

  // Handle FROM address balance
  let fromHolderId = event.address.toHexString() + '-' + event.params.from.toHexString()
  let fromHolder = Holder.load(fromHolderId)
  if (fromHolder === null) {
    fromHolder = new Holder(fromHolderId)
    platform.totalHolders = platform.totalHolders.plus(BigInt.fromI32(1))
    fromHolder.token = token.id
    fromHolder.user = event.params.from.toHexString()
    fromHolder.balance = BigInt.fromI32(0)
  }
  let fromUser = User.load(event.params.from.toHexString())
  if (fromUser === null) {
    fromUser = new User(event.params.from.toHexString())
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
    fromUser.save()
  }
  if (fromHolder.balance.lt(event.params.value)) {
    log.info('Insufficient balance: ', [event.params.from.toHexString(), event.params.value.toString()])
    return
  }
  fromHolder.balance = fromHolder.balance.minus(event.params.value)
  fromHolder.save()

  // Handle TO address balance
  let toHolderId = event.address.toHexString() + '-' + event.params.to.toHexString()
  let toHolder = Holder.load(toHolderId)
  if (toHolder === null) {
    toHolder = new Holder(toHolderId)
    platform.totalHolders = platform.totalHolders.plus(BigInt.fromI32(1))
    toHolder.token = token.id
    toHolder.user = event.params.to.toHexString()
    toHolder.balance = BigInt.fromI32(0)
  }
  let toUser = User.load(event.params.to.toHexString())
  if (toUser === null) {
    toUser = new User(event.params.to.toHexString())
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
    toUser.save()
  }
  toHolder.balance = toHolder.balance.plus(event.params.value)
  toHolder.save()
}
