import { ServiceProto } from 'tsrpc-proto';
import { MsgOnline } from './protocol/MsgOnline';
import { MsgWalletUpdate } from './protocol/MsgWalletUpdate';
import { ReqInit, ResInit } from './protocol/PtlInit';
import { ReqWalletCreate, ResWalletCreate } from './protocol/PtlWalletCreate';

export interface ServiceType {
    api: {
        "Init": {
            req: ReqInit,
            res: ResInit
        },
        "WalletCreate": {
            req: ReqWalletCreate,
            res: ResWalletCreate
        }
    },
    msg: {
        "Online": MsgOnline,
        "WalletUpdate": MsgWalletUpdate
    }
}

export const serviceProto: ServiceProto<ServiceType> = {
    "services": [
        {
            "id": 0,
            "name": "Online",
            "type": "msg"
        },
        {
            "id": 1,
            "name": "WalletUpdate",
            "type": "msg"
        },
        {
            "id": 2,
            "name": "Init",
            "type": "api"
        },
        {
            "id": 3,
            "name": "WalletCreate",
            "type": "api"
        }
    ],
    "types": {
        "MsgOnline/MsgOnline": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "online",
                    "type": {
                        "type": "Boolean"
                    }
                },
                {
                    "id": 1,
                    "name": "error",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "MsgWalletUpdate/MsgWalletUpdate": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "address",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "balances",
                    "type": {
                        "type": "Interface",
                        "indexSignature": {
                            "keyType": "String",
                            "type": {
                                "type": "String"
                            }
                        }
                    }
                }
            ]
        },
        "PtlInit/ReqInit": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "chain",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "implementedMethods",
                    "type": {
                        "type": "Array",
                        "elementType": {
                            "type": "String"
                        }
                    }
                }
            ]
        },
        "PtlInit/ResInit": {
            "type": "Interface"
        },
        "PtlWalletCreate/ReqWalletCreate": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "entropy",
                    "type": {
                        "type": "String"
                    },
                    "optional": true
                }
            ]
        },
        "PtlWalletCreate/ResWalletCreate": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "address",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "secrets",
                    "type": {
                        "type": "Interface",
                        "indexSignature": {
                            "keyType": "String",
                            "type": {
                                "type": "String"
                            }
                        }
                    }
                }
            ]
        }
    }
};