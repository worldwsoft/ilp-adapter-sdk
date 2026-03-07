export type Caip2ChainId = `${string}:${string}`
export type Caip10WalletAddress = `${string}:${string}:${string}`
export type Caip19AssetId = `${string}:${string}/${string}:${string}`

export type RegisterCommand = {
	command: 'Register',
	chainId: Caip2ChainId,
	implementedMethods: Array<string>
}

export type RegisterResult = {

}

export type OnlineEvent = {
	event: 'Online',
	online: boolean,
	error?: string
}

export type WalletCreateCommand = {
	command: 'WalletCreate'
	entropy: string
}

export type WalletCreateResult = {
	address: Caip10WalletAddress,
	secrets: Record<string, string>
}

export type WalletQueryCommand = {
	command: 'WalletQuery'
	address: Caip10WalletAddress
}

export type WalletQueryResult = {
	balances: Record<Caip19AssetId, string>
}