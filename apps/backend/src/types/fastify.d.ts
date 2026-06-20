import { FastifyRequest, FastifyReply } from 'fastify'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { Kafka, Producer } from 'kafkajs'
import { Server as SocketIOServer } from 'socket.io'

// Augment @fastify/jwt so request.user is typed
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; username: string }
    user:    { id: string; email: string; username: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma:        PrismaClient
    redis:         Redis
    kafka:         Kafka
    kafkaProducer: Producer
    io:            SocketIOServer
    authenticate:  (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
