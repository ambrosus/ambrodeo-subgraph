import { Address, log } from '@graphprotocol/graph-ts'
import { Token, Holder } from '../types/schema'
import { Transfer, Token as TokenContract } from '../types/templates/Token/Token'
import { createHolder } from './helpers'

export function handleTransfer(event: Transfer): void {
  // Check token existing
  const token = Token.load(event.address.toHexString())
  if (token === null) {
      throw new Error('Token not found')
  }
  const tokenContract = TokenContract.bind(event.address)

  // Handle FROM address balance
  if (event.params.from != Address.zero()) {
    log.info(
      "from: {}, is not equal to 0x0000000000000000000000000000000000000000",
      [event.params.from.toHexString()]
    );
    handleFromUser(event, tokenContract);
  }
  if (event.params.to != Address.zero()) {
      handleToUser(event, tokenContract);
  }
}

function handleFromUser(event: Transfer, tokenContract: TokenContract): void {
  const userAddress = event.params.from
  const fromHolderId = event.address.toHexString() + '-' + userAddress.toHexString()
  log.info("fromHolderId: {}", [fromHolderId])
  let fromHolder = Holder.load(fromHolderId);
  if (fromHolder === null) fromHolder = createHolder(userAddress, tokenContract);
  log.info("fromUser id: {}", [userAddress.toHexString()])
  if (fromHolder.balance.lt(event.params.value)) {
    log.error('[{}] Insufficient balance: {}', [userAddress.toHexString(), event.params.value.toString()])
    log.error('Current balance: {}', [fromHolder.balance.toString()])
    log.error('What to transfer: {}', [event.params.value.toString()])
    throw new Error('Insufficient balance')
  }
  fromHolder.balance = fromHolder.balance.minus(event.params.value)
  fromHolder.save()
}

function handleToUser(event: Transfer, tokenContract: TokenContract): void {
  const userAddress = event.params.to
  const toHolderId = event.address.toHexString() + '-' + userAddress.toHexString()
  log.info("toHolderId: {}", [toHolderId])
  let toHolder = Holder.load(toHolderId);
  if (toHolder === null) toHolder = createHolder(userAddress, tokenContract);
  log.info("toUser id: {}", [userAddress.toHexString()])
  toHolder.balance = toHolder.balance.plus(event.params.value)
  toHolder.save()
}
