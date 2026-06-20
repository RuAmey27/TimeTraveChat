import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { extractErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth.store'

type LoginMode = 'email' | 'phone'

export default function LoginPage() {
  const [mode,     setMode]     = useState<LoginMode>('email')
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = mode === 'email'
        ? { email: identity, password }
        : { phone: identity, password }
      const { data } = await api.post<{ token: string; user: { id: string; username: string; email: string } }>(
        '/auth/login', body
      )
      setAuth(data.token, data.user)
      navigate('/')
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Time-Travel Chat</h1>
        <p className="text-sm text-gray-500 mb-5">Sign in to your account</p>

        {/* Email / Phone toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-5">
          {(['email', 'phone'] as LoginMode[]).map((m) => (
            <button
              key={m} type="button"
              onClick={() => { setMode(m); setIdentity('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m === 'email' ? 'Email' : 'Mobile number'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'email' ? 'Email' : 'Mobile number'}
            </label>
            <input
              type={mode === 'email' ? 'email' : 'tel'}
              required value={identity} onChange={(e) => setIdentity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder={mode === 'email' ? 'you@example.com' : '+919876543210'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          No account?{' '}
          <Link to="/register" className="text-brand-600 hover:underline font-medium">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
