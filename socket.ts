import { EventEmitter } from 'node:events'

export function createQueuedCommandResultEventDispatcher(socket, handlers){
	let requestRegistry = []
	let requestCounter = 0

	socket.on('open', pushRequests)
	socket.on('close', event => {
		for(let { reject } of requestRegistry){
			reject(new Error(event?.reason || 'connection closed'))
		}

		requestRegistry.length = 0
	})

	socket.on('message', (payload: any) => {
		if(payload.requestId){
			let handlerIndex = requestRegistry
				.findIndex(({ requestId }) => requestId === payload.requestId)

			if(handlerIndex >= 0){
				let request = requestRegistry[handlerIndex]

				try{
					if(handlers[payload.command])
						throw new Error(`unknown command "${payload.command}"`)

					request.resolve(
						await handlers[payload.command](payload)
					)
				}catch(error){
					request.reject(error)
				}finally{
					requestRegistry.splice(handlerIndex, 1)
				}
			}
		}else if(payload.event){
			if(handlers[payload.command])
				throw new Error(`unknown event "${payload.event}"`)

			handlers[payload.event](payload)
		}else{
			throw new Error(`unexpected message format: ${JSON.stringify(payload)}`)
		}
	})

	function pushRequests(){
		if(socket.readyState !== 1)
			return

		for(let request of requestRegistry.slice()){
			if(request.sent)
				continue

			socket.send(request.payload)

			if(request.requestId)
				request.sent = true
			else
				requestRegistry.splice(requestRegistry.indexOf(request), 1)
		}
	}

	return {
		async sendCommand(payload: any){
			let requestId = `r${++requestCounter}`
			let request = {
				requestId,
				payload: {
					...payload,
					requestId
				}
			}

			return Object.assign(
				new Promise((resolve, reject) => {
					Object.assign(request, {
						resolve,
						reject
					})

					requestRegistry.push(request)
					pushRequests()
				}),
				request
			)
		},
		sendEvent(payload: any){
			requestRegistry.push({ payload })
			pushRequests()
		}
	}
}

export function createSocket(url: string){
	let socket: WebSocket
	let events = new EventEmitter()

	function connect(){
		socket = new WebSocket(url)
		socket.addEventListener('open', handleOpen)
		socket.addEventListener('close', handleClose)
		socket.addEventListener('error', handleError)
		socket.addEventListener('message', handleMessage)
	}

	function handleOpen(event){
		events.emit('open', event)
	}

	function handleClose(event){
		setTimeout(connect, 1000)
		events.emit('close', event)
	}

	function handleError(event){
		events.emit('error', event)
	}

	function handleMessage(evt){
		events.emit('message', JSON.parse(evt.data))
	}

	connect()

	return Object.assign(
		events,
		{
			send(payload: any){
				socket.send(JSON.stringify(payload))
			}
		}
	)
}