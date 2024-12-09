import { TokenDeployed } from '../generated/TokenFactory/TokenFactory'
import { Token, User } from '../generated/schema'
import { DataSourceContext, DataSourceTemplate } from '@graphprotocol/graph-ts'

export function handleTokenCreated(event: TokenDeployed): void {
  // Create or load the User entity
  let user = User.load(event.params.user.toHex())
  if (user == null) {
    user = new User(event.params.user.toHex())
    user.isInsider = false
    user.save()
  }

  // Create the Token entity
  let token = new Token(event.params.tokenAddress.toHex())
  token.creator = user.id
  token.name = event.params.name
  token.symbol = event.params.symbol
  token.initialSupply = event.params.totalSupply
  token.totalSupply = event.params.totalSupply
  token.createdAt = event.block.timestamp
  token.save()

  // Create a new context for the template
  let context = new DataSourceContext()
  context.setString('tokenAddress', event.params.tokenAddress.toHexString())

  // Create a new data source from template
  DataSourceTemplate.create('Token', [event.params.tokenAddress.toHexString()])
}
