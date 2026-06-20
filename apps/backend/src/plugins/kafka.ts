import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Kafka } from 'kafkajs'
import { config } from '../config'

export const TOPICS = {
  CHAT_EVENTS:   'chat-events',
  NOTIFICATIONS: 'notifications',
} as const

export default fp(async (app: FastifyInstance) => {
  const kafka = new Kafka({
    clientId: 'time-travel-chat',
    brokers:  config.KAFKA_BROKERS.split(','),
    // Upstash Kafka (and other managed brokers) require SASL + SSL
    ...(config.KAFKA_USERNAME && {
      ssl:  true,
      sasl: {
        mechanism: 'scram-sha-256' as const,
        username:  config.KAFKA_USERNAME,
        password:  config.KAFKA_PASSWORD ?? '',
      },
    }),
    retry: { retries: 5 },
  })

  // Ensure topics exist
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    topics: Object.values(TOPICS).map((topic) => ({
      topic,
      numPartitions:     3,
      replicationFactor: 1,
    })),
    waitForLeaders: true,
  }).catch(() => { /* topics already exist — ignore */ })
  await admin.disconnect()

  const producer = kafka.producer()
  await producer.connect()

  app.decorate('kafka',         kafka)
  app.decorate('kafkaProducer', producer)

  app.addHook('onClose', async () => {
    await producer.disconnect()
  })
})
