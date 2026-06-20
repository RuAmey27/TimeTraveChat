import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth.store'

// In production, connect directly to the Render backend URL.
// In dev, connect to '/' so the Vite proxy handles /socket.io upgrade.
const BACKEND_ORIGIN = import.meta.env.VITE_API_URL ?? ''

let _socket: Socket | null = null

/**
 * Returns a singleton Socket.io client, authenticated with the stored JWT.
 * The socket connects lazily on first call and stays alive across page navigations.
 */
export function useSocket(): Socket | null {
  const token = useAuthStore((s) => s.token)
  const ref   = useRef<Socket | null>(null)

  if (!ref.current) {
    if (!token) return null

    // Reuse module-level singleton so we don't reconnect on every render
    if (!_socket) {
      _socket = io(BACKEND_ORIGIN, {
        auth:        { token },
        transports:  ['websocket', 'polling'],
        autoConnect: true,
      })
    }
    ref.current = _socket
  }

  // Reset singleton on logout (token gone)
  useEffect(() => {
    return () => {
      if (!token && _socket) {
        _socket.disconnect()
        _socket = null
      }
    }
  }, [token])

  return ref.current
}

/** Tear down the socket — call on logout */
export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect()
    _socket = null
  }
}
