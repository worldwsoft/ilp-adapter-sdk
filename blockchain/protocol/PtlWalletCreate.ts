export interface ReqWalletCreate {
	entropy?: string
}

export interface ResWalletCreate {
	address: string
	secrets: {
		[key:string]: string
	}
}