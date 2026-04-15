import { createWsServer } from './ws-server.js'

const PORT = Number(process.env.PORT ?? 3001)
createWsServer(PORT)
