import { Token, Holder } from '../types/schema'
import {  BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../types/templates/Token/Token'
import { store } from '@graphprotocol/graph-ts'

export function handleTransfer(event: Transfer): void {
  let token = Token.load(event.address.toHexString())
  if (!token) return

  // Handle FROM address balance
  let fromHolderId = event.address.toHexString() + '-' + event.params.from.toHexString()
  let fromHolder = Holder.load(fromHolderId)
  if (fromHolder) {
    fromHolder.balance = fromHolder.balance.minus(event.params.value)
    fromHolder.save()
    
    // Remove holder entity if balance becomes zero
    if (fromHolder.balance.equals(BigInt.fromI32(0))) {
      store.remove('Holder', fromHolderId)
    }
  }

  // Handle TO address balance
  let toHolderId = event.address.toHexString() + '-' + event.params.to.toHexString()
  let toHolder = Holder.load(toHolderId)
  if (!toHolder) {
    toHolder = new Holder(toHolderId)
    toHolder.token = token.id
    toHolder.user = event.params.to.toHexString()
    toHolder.balance = BigInt.fromI32(0)
  }
  toHolder.balance = toHolder.balance.plus(event.params.value)
  toHolder.save()
}
