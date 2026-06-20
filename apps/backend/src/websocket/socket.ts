import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Server as SocketIOServer } from 'socket.io'

export default fp(async (app: FastifyInstance) => {
  const io = new SocketIOServer(app.server, {
    cors: { origin: '*', credentials: true },
    // Allow the Vite dev proxy to upgrade connections
    transports: ['websocket', 'polling'],
  })

  // ── JWT authentication middleware for every socket ───────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Authentication required'))
    try {
      const payload = app.jwt.verify<{ id: string; email: string; username: string }>(token)
      socket.data.user = payload
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const user: { id: string; username: string } = socket.data.user

    // Personal notification room — always joined on connect
    socket.join(`user:${user.id}`)

    // Client asks to subscribe to a chat room (call once per chat page open)
    socket.on('chat:join', (chatId: string) => {
      socket.join(`chat:${chatId}`)
    })

    socket.on('chat:leave', (chatId: string) => {
      socket.leave(`chat:${chatId}`)
    })

    socket.on('disconnect', () => {
      app.log.debug({ userId: user.id }, 'Socket disconnected')
    })
  })

  app.decorate('io', io)

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()))
  })
})
