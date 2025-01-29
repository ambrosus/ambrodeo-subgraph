import { Token, Holder, User } from '../types/schema'
import {  BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../types/templates/Token/Token'
import { log } from '@graphprotocol/graph-ts'

export function handleTransfer(event: Transfer): void {
  let token = Token.load(event.address.toHexString())
  if (!token) return

  // Handle FROM address balance
  let fromHolderId = event.address.toHexString() + '-' + event.params.from.toHexString()
  let fromHolder = Holder.load(fromHolderId)
  if (fromHolder === null) {
    log.info("Create the holder for new token with id: {}, user id: {}", [fromHolderId, event.params.from.toHexString()])
      fromHolder = new Holder(fromHolderId)
      fromHolder.token = token.id
      fromHolder.user = event.params.from.toHexString()
      fromHolder.balance = BigInt.fromI32(0)
  }
  log.info("Loaded fromHolder: {}, userId: {}", [fromHolderId, fromHolder.user])
  let fromUser = User.load(event.params.from.toHexString())
  if (fromUser === null) {
    log.info("Create the user for new holder with id: {}", [event.params.from.toHexString()])
    fromUser = new User(event.params.from.toHexString())
    fromUser.isInsider = false
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
    log.info("Create the holder for new token with id: {}, user id: {}", [toHolderId, event.params.to.toHexString()])
    toHolder = new Holder(toHolderId)
    toHolder.token = token.id
    toHolder.user = event.params.to.toHexString()
    toHolder.balance = BigInt.fromI32(0)
  }
  let toUser = User.load(event.params.to.toHexString())
  if (toUser === null) {
    log.info("Create the user for new holder with id: {}", [event.params.to.toHexString()])
    toUser = new User(event.params.to.toHexString())
    toUser.isInsider = false
    toUser.save()
  }
  log.info("Loaded toHolder: {}, userId: {}", [toHolderId, toHolder.user])
  toHolder.balance = toHolder.balance.plus(event.params.value)
  toHolder.save()
}
