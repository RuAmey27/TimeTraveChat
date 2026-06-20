import axios from 'axios'
import { useAuthStore } from '../store/auth.store'

// In production VITE_API_URL points to the Render backend
// e.g. https://ttt-backend.onrender.com
// In dev it's empty so requests go through the Vite proxy (/api → localhost:4000)
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

export const api = axios.create({ baseURL: BASE })

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    // Re-throw the original axios error so callers can still read err.response.data
    return Promise.reject(err)
  }
)
