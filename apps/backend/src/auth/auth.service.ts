import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { RegisterInput, LoginInput } from './auth.schema'
import { httpError } from '../shared/errors'

export async function register(app: FastifyInstance, input: RegisterInput) {
  const orConditions: Array<{ email: string } | { username: string } | { phone: string }> = [
    { email: input.email },
    { username: input.username },
  ]
  if (input.phone) orConditions.push({ phone: input.phone })

  const existing = await app.prisma.user.findFirst({ where: { OR: orConditions } })

  if (existing) {
    let field = 'email'
    if (existing.username === input.username) field = 'username'
    else if (input.phone && existing.phone === input.phone) field = 'phone'
    throw httpError(409, `${field} already taken`)
  }

  const passwordHash = await bcrypt.hash(input.password, 12)

  const user = await app.prisma.user.create({
    data: { username: input.username, email: input.email, phone: input.phone ?? null, passwordHash },
    select: { id: true, username: true, email: true, phone: true, createdAt: true },
  })

  const token = app.jwt.sign({ id: user.id, email: user.email, username: user.username })
  return { token, user }
}

export async function login(app: FastifyInstance, input: LoginInput) {
  // Find by email or phone
  const user = await app.prisma.user.findFirst({
    where: input.email ? { email: input.email } : { phone: input.phone },
  })

  // Constant-time guard against user-enumeration timing attacks
  const fakeHash = '$2a$12$invalidhashinvalidhashinvalid'
  const valid = user
    ? await bcrypt.compare(input.password, user.passwordHash)
    : await bcrypt.compare(input.password, fakeHash) && false

  if (!user || !valid) {
    throw httpError(401, 'Invalid credentials')
  }

  const token = app.jwt.sign({ id: user.id, email: user.email, username: user.username })
  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, phone: user.phone, createdAt: user.createdAt },
  }
}
