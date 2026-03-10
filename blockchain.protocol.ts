export type Caip2ChainId = `${string}:${string}`
export type Caip10WalletAddress = `${Caip2ChainId}:${string}`
export type Caip19AssetId = `${Caip2ChainId}/${string}:${string}`

export type BlockchainMethod = 'WalletVerify' | 'WalletCreate' | 'WalletQuery' | 'WalletWatch'
export type BlockchainRegisterResult = Record<string, never>
export type WalletKey = { type: string, value: string }
export type WalletBalances = Record<Caip19AssetId, string>

export interface BlockchainRegisterCommand {
	command: 'BlockchainRegister'
	chainId: Caip2ChainId
	implementedMethods: BlockchainMethod[]
}

export interface WalletVerifyCommand {
	command: 'WalletVerify'
	address?: Caip10WalletAddress
	key: WalletKey
}

export interface WalletVerifyResult {
	address: Caip10WalletAddress
}

export interface WalletCreateCommand {
	command: 'WalletCreate'
	entropy: string
}

export interface WalletCreateResult {
	address: Caip10WalletAddress
	key: WalletKey
}

export interface WalletQueryCommand {
	command: 'WalletQuery'
	address: Caip10WalletAddress
}

export interface WalletQueryResult {
	balances: WalletBalances
}

export interface WalletWatchCommand {
	command: 'WalletWatch'
	addresses: Caip10WalletAddress[]
}

export interface WalletUpdateEvent {
	event: 'WalletUpdate',
	address: Caip10WalletAddress
	balances: WalletBalances
}

export type BlockchainCommand =
	| BlockchainRegisterCommand
	| WalletVerifyCommand
	| WalletCreateCommand
	| WalletQueryCommand
	| WalletWatchCommand

export type BlockchainResult =
	| BlockchainRegisterResult
	| WalletVerifyResult
	| WalletCreateResult
	| WalletQueryResult