/**
 * AppLayout — Estrutura principal com sidebar institucional e header.
 * Usado em todas as rotas autenticadas do sistema A&C.
 */

import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  UserX,
  FileText,
  MessageSquare,
  Calendar,
  CheckSquare,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  Scale,
  ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: '/cobranca',              icon: LayoutDashboard },
  { label: 'Casos',          href: '/cobranca/casos',        icon: FolderOpen },
  { label: 'Novo Caso',      href: '/cobranca/novo-caso',    icon: FileText },
  { label: 'Credores',       href: '/cobranca/credores',     icon: Users },
  { label: 'Devedores',      href: '/cobranca/devedores',    icon: UserX },
  { label: 'Comunicações',   href: '/cobranca/comunicacoes', icon: MessageSquare },
  { label: 'Prazos',         href: '/cobranca/prazos',       icon: Calendar },
  { label: 'Tarefas',        href: '/cobranca/tarefas',      icon: CheckSquare },
  { label: 'Relatórios',     href: '/cobranca/relatorios',   icon: BarChart2 },
]

function LogoMarca({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5" style={{ borderBottom: '1px solid rgba(184,156,92,0.15)' }}>
      {/* Escudo miniatura */}
      <div className="flex-shrink-0">
        <svg viewBox="0 0 40 48" className="w-8 h-9" aria-hidden="true">
          <path
            d="M20 2 L37 10 L37 29 Q37 41 20 46 Q3 41 3 29 L3 10 Z"
            fill="#5A1E2A"
            stroke="#B89C5C"
            strokeWidth="1"
          />
          <text
            x="20" y="30"
            textAnchor="middle"
            fontFamily="'Cinzel', serif"
            fontSize="14"
            fontWeight="700"
            fill="#B89C5C"
          >
            A
          </text>
        </svg>
      </div>

      {!collapsed && (
        <div className="overflow-hidden">
          <p
            className="font-cinzel text-xs font-bold leading-tight tracking-widest truncate"
            style={{ color: '#B89C5C' }}
          >
            ANDRADE &amp; CINTRA
          </p>
          <p
            className="font-montserrat text-[9px] tracking-[0.2em] uppercase opacity-40 mt-0.5"
            style={{ color: '#C0C0C0' }}
          >
            Sistema de Cobranças
          </p>
        </div>
      )}
    </div>
  )
}

interface SidebarLinkProps {
  item: NavItem
  collapsed: boolean
  onClick?: () => void
}

function SidebarLink({ item, collapsed, onClick }: SidebarLinkProps) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.href}
      end={item.href === '/cobranca'}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 mx-2 px-3 py-2.5 rounded text-sm font-montserrat font-medium',
          'transition-all duration-150 group relative',
          isActive
            ? 'bg-ac-vinho text-white'
            : 'text-[#8AA3BE] hover:bg-white/8 hover:text-white',
        ].join(' ')
      }
      title={collapsed ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            className={`flex-shrink-0 ${isActive ? 'text-[#B89C5C]' : 'opacity-70 group-hover:opacity-100'}`}
          />
          {!collapsed && (
            <span className="truncate">{item.label}</span>
          )}
          {!collapsed && item.badge !== undefined && item.badge > 0 && (
            <span
              className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
              style={{ backgroundColor: '#5A1E2A', color: '#F5F5F5' }}
            >
              {item.badge}
            </span>
          )}
          {/* Tooltip quando collapsed */}
          {collapsed && (
            <div
              className="absolute left-full ml-2 px-2 py-1 text-xs font-medium rounded whitespace-nowrap
                         opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50
                         shadow-lg"
              style={{ backgroundColor: '#1A2E42', color: '#F5F5F5', border: '1px solid rgba(184,156,92,0.2)' }}
            >
              {item.label}
              <ChevronRight size={10} className="inline ml-1 opacity-50" />
            </div>
          )}
        </>
      )}
    </NavLink>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userName, setUserName] = useState<string>('')

  // Obtém nome do usuário logado
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/login'); return }
    })
    supabase
      .from('usuarios')
      .select('nome, role')
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) setUserName(data[0].nome.split(' ')[0])
      })
  }, [navigate])

  // Fecha menu mobile ao navegar
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 'w-16' : 'w-60'

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#FAFAF8' }}>

      {/* ── Overlay mobile ─────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside
        className={[
          'fixed top-0 left-0 h-full z-40 flex flex-col',
          'transition-all duration-200 ease-in-out',
          sidebarWidth,
          // Mobile: off-canvas
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0 lg:static lg:z-auto',
        ].join(' ')}
        style={{ backgroundColor: '#0D1B2A' }}
        aria-label="Navegação principal"
      >
        {/* Logo */}
        <LogoMarca collapsed={collapsed} />

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden space-y-0.5">
          {NAV_ITEMS.map(item => (
            <SidebarLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              onClick={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        {/* Rodapé da sidebar */}
        <div style={{ borderTop: '1px solid rgba(184,156,92,0.12)' }} className="py-3">
          {/* Configurações */}
          <NavLink
            to="/cobranca/configuracoes"
            className="flex items-center gap-3 mx-2 px-3 py-2 rounded text-sm font-montserrat
                       font-medium text-[#8AA3BE] hover:bg-white/8 hover:text-white
                       transition-colors group"
          >
            <Settings size={17} className="flex-shrink-0 opacity-70 group-hover:opacity-100" />
            {!collapsed && <span>Configurações</span>}
          </NavLink>

          {/* Usuário + Logout */}
          {!collapsed && userName && (
            <div
              className="mx-2 mt-2 px-3 py-2 rounded flex items-center justify-between"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                             font-montserrat font-bold text-xs"
                  style={{ backgroundColor: '#5A1E2A', color: '#B89C5C' }}
                >
                  {userName[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-montserrat text-[#8AA3BE] truncate">{userName}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-[#8AA3BE] hover:text-red-400 transition-colors p-1 rounded"
                aria-label="Sair do sistema"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

          {collapsed && (
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-full py-2 text-[#8AA3BE]
                         hover:text-red-400 transition-colors"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>

        {/* Botão recolher — apenas desktop */}
        <button
          onClick={() => setCollapsed(prev => !prev)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full
                     items-center justify-center shadow-md transition-colors"
          style={{ backgroundColor: '#0D1B2A', border: '1px solid rgba(184,156,92,0.3)', color: '#B89C5C' }}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <ChevronRight
            size={12}
            className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>
      </aside>

      {/* ── Área principal ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-4 lg:px-6 h-14 shadow-sm z-20"
          style={{ backgroundColor: '#0D1B2A', borderBottom: '1px solid rgba(184,156,92,0.15)' }}
        >
          {/* Botão menu mobile */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded text-[#8AA3BE] hover:text-white"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb / título da página — injetado via data-attr ou slot */}
          <div className="flex items-center gap-2">
            <Scale size={14} className="opacity-40" style={{ color: '#B89C5C' }} />
            <span
              className="font-cinzel text-sm font-semibold tracking-wider hidden sm:block"
              style={{ color: '#B89C5C', opacity: 0.8 }}
            >
              ANDRADE &amp; CINTRA
            </span>
          </div>

          {/* Direita: nome usuário */}
          {userName && (
            <div className="flex items-center gap-2">
              <span className="font-montserrat text-xs text-[#8AA3BE] hidden sm:block">
                Olá, {userName}
              </span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center
                           font-montserrat font-bold text-xs"
                style={{ backgroundColor: '#5A1E2A', color: '#B89C5C' }}
              >
                {userName[0]?.toUpperCase()}
              </div>
            </div>
          )}
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: '#FAFAF8' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
