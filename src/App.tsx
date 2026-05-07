import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '@/pages/Login'

// Placeholder para os módulos seguintes do MVP
function DashboardPlaceholder() {
  return (
    <div className="min-h-screen bg-ac-fundo flex items-center justify-center">
      <div className="text-center">
        <h2 className="font-cinzel text-2xl text-ac-vinho mb-2">Dashboard</h2>
        <p className="font-lato text-sm text-ac-texto opacity-50">
          Em construção — MVP Fase 1
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cobranca" element={<DashboardPlaceholder />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
