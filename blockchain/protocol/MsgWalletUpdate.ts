export interface MsgWalletUpdate {
	address: string
	balances: {
		[key:string]: string
	}
}