export interface ReqWalletQuery {
	address: string
}

export interface ResWalletQuery {
	balances: {
		[key:string]: string
	}
}