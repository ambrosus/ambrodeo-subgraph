import { Token, Holder, User } from '../types/schema'
import {  BigInt } from '@graphprotocol/graph-ts'
import { Transfer, Token as TokenContract } from '../types/templates/Token/Token'
import { log } from '@graphprotocol/graph-ts'

export function handleTransfer(event: Transfer): void {
  let token = Token.load(event.address.toHexString())
  if (token === null) {
      throw new Error('Token not found')
  }

  let tokenContract = TokenContract.bind(event.address)

  // Handle FROM address balance
  if (event.params.from.toHexString() != '0x0000000000000000000000000000000000000000') {
      log.info("from: {}, is not equal to 0x0000000000000000000000000000000000000000", [event.params.from.toHexString()])
      handleFromUser(event, token as Token, tokenContract)
  }
  if (event.params.to.toHexString() !== '0x0000000000000000000000000000000000000000') {
      handleToUser(event, token as Token, tokenContract)
  }
}

function handleFromUser(event: Transfer, token: Token, tokenContract: TokenContract): void {
  let fromHolderId = event.address.toHexString() + '-' + event.params.from.toHexString()
  let fromHolder = Holder.load(fromHolderId)
  log.info("fromHolderId: {}", [fromHolderId])
  if (fromHolder === null) {
    log.info('fromHolder is null', [])
    fromHolder = new Holder(fromHolderId)
    fromHolder.token = token.id
    fromHolder.user = event.params.from.toHexString()
    fromHolder.balance = tokenContract.balanceOf(event.params.from)
  }
  let fromUser = User.load(event.params.from.toHexString())
  log.info("fromUser id: {}", [event.params.from.toHexString()])
  if (fromUser === null) {
    log.info('fromUser is null', [])
    fromUser = new User(event.params.from.toHexString())
    fromUser.totalTokensCreated = BigInt.fromI32(0)
    fromUser.totalTrades = BigInt.fromI32(0)
    fromUser.isInsider = false
    fromUser.save()
  }
  if (fromHolder.balance.lt(event.params.value)) {
    log.info('Insufficient balance: {}', [event.params.from.toHexString(), event.params.value.toString()])
    log.info('Current balance: {}', [fromHolder.balance.toString()])
    log.info('What to transfer: {}', [event.params.value.toString()])
    throw new Error('Insufficient balance')
  }
  fromHolder.balance = fromHolder.balance.minus(event.params.value)
  fromHolder.save()
}

function handleToUser(event: Transfer, token: Token, tokenContract: TokenContract): void {
  let toHolderId = event.address.toHexString() + '-' + event.params.to.toHexString()
  log.info("toHolderId: {}", [toHolderId])
  let toHolder = Holder.load(toHolderId)
  if (toHolder === null) {
    log.info('toHolder is null', [])
    toHolder = new Holder(toHolderId)
    toHolder.token = token.id
    toHolder.user = event.params.to.toHexString()
    toHolder.balance = tokenContract.balanceOf(event.params.to)
  }
  let toUser = User.load(event.params.to.toHexString())
  log.info("toUser id: {}", [event.params.to.toHexString()])
  if (toUser === null) {
    log.info("toUser is null", [])
    toUser = new User(event.params.to.toHexString())
    toUser.totalTokensCreated = BigInt.fromI32(0)
    toUser.totalTrades = BigInt.fromI32(0)
    toUser.isInsider = false
    toUser.save()
  }
  toHolder.balance = toHolder.balance.plus(event.params.value)
  toHolder.save()
}
