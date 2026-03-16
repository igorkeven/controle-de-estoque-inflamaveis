import { useEffect, useMemo, useState } from 'react'

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'weg-controle-auth'
const DEVICE_STORAGE_KEY = 'weg-controle-device-id'
const LOGO_SRC = `${import.meta.env.BASE_URL}logo-weg-256.png`

const tabs = [
  { id: 'painel', label: 'Painel' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'lotes', label: 'Compras' },
  { id: 'movimentacoes', label: 'Movimentacoes' },
  { id: 'estoque', label: 'Estoque/Validades' },
  { id: 'tanque', label: 'Analise Tanque' },
  { id: 'controle', label: 'Controle' },
]

const todayISO = new Date().toISOString().slice(0, 10)

function getCurrentTimeHHMM() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function inferShiftFromTime(value) {
  if (!value) {
    return ''
  }
  const [hour, minute] = value.split(':').map(Number)
  const totalMinutes = hour * 60 + minute
  if (totalMinutes >= 300 && totalMinutes < 858) {
    return 'PRIMEIRO TURNO'
  }
  if (totalMinutes >= 858 && totalMinutes < 1380) {
    return 'SEGUNDO TURNO'
  }
  return 'TERCEIRO TURNO'
}

function formatPrintDate(value) {
  if (!value) {
    return '-'
  }
  const [year, month, day] = String(value).split('-')
  if (!year || !month || !day) {
    return value
  }
  return `${day}/${month}/${year}`
}

function ChartTooltip({ tooltip }) {
  if (!tooltip) {
    return null
  }

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-lg"
      style={{
        left: tooltip.x + 12,
        top: tooltip.y + 12,
      }}
    >
      {tooltip.lines.map((line, index) => (
        <p key={index} className={index === 0 ? 'font-bold text-slate-900' : ''}>
          {line}
        </p>
      ))}
    </div>
  )
}

function TankChart({ data }) {
  const width = 760
  const height = 260
  const padding = 32
  const [tooltip, setTooltip] = useState(null)
  const sorted = [...data].reverse()
  const values = sorted.map((item) => item.viscosity_seconds)
  const maxValue = Math.max(55, ...values, 52)
  const minValue = Math.min(45, ...values, 48)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Sem leituras ainda para montar o grafico.
      </div>
    )
  }

  const points = sorted.map((item, index) => {
    const x = padding + (usableWidth * index) / Math.max(sorted.length - 1, 1)
    const y =
      padding + ((maxValue - item.viscosity_seconds) / Math.max(maxValue - minValue, 1)) * usableHeight
    return { ...item, x, y }
  })

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const targetTop = padding + ((maxValue - 52) / Math.max(maxValue - minValue, 1)) * usableHeight
  const targetBottom = padding + ((maxValue - 48) / Math.max(maxValue - minValue, 1)) * usableHeight

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        <rect x="0" y="0" width={width} height={height} fill="#fff" />
        <rect
          x={padding}
          y={targetTop}
          width={usableWidth}
          height={targetBottom - targetTop}
          fill="#dcfce7"
          opacity="0.8"
        />
        {[minValue, 48, 50, 52, maxValue].map((value) => {
          const y = padding + ((maxValue - value) / Math.max(maxValue - minValue, 1)) * usableHeight
          return (
            <g key={value}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#cbd5e1" strokeDasharray="4 4" />
              <text x="4" y={y + 4} fontSize="10" fill="#475569">
                {formatViscosity(value)}
              </text>
            </g>
          )
        })}
        <path d={path} fill="none" stroke="#0f766e" strokeWidth="3" />
        {points.map((point) => (
          <g key={point.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill={point.in_target_range ? '#16a34a' : '#dc2626'}
              onMouseEnter={(event) =>
                setTooltip({
                  x: event.clientX,
                  y: event.clientY,
                  lines: [
                    `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                    `Visc. inicial: ${formatViscosity(point.viscosity_seconds)}`,
                    point.corrected_viscosity_seconds
                      ? `Visc. apos correcao: ${formatViscosity(point.corrected_viscosity_seconds)}`
                      : 'Sem viscosidade apos correcao',
                    `Solvente: ${point.solvent_amount ?? 0}`,
                    `Tinta: ${point.paint_amount ?? 0}`,
                    `Responsavel: ${point.responsible || '-'}`,
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            {Number(point.solvent_amount || 0) > 0 ? (
              <rect
                x={point.x - 4}
                y={point.y - 16}
                width="8"
                height="8"
                fill="#2563eb"
                rx="1"
                onMouseEnter={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    lines: [
                      `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                      `Adicao de solvente: ${point.solvent_amount}`,
                      `Viscosidade inicial: ${formatViscosity(point.viscosity_seconds)}`,
                    ],
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            ) : null}
            {Number(point.paint_amount || 0) > 0 ? (
              <polygon
                points={`${point.x},${point.y - 20} ${point.x - 5},${point.y - 10} ${point.x + 5},${point.y - 10}`}
                fill="#ea580c"
                onMouseEnter={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    lines: [
                      `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                      `Adicao de tinta: ${point.paint_amount}`,
                      `Viscosidade inicial: ${formatViscosity(point.viscosity_seconds)}`,
                    ],
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            ) : null}
            {point.corrected_viscosity_seconds ? (
              <>
                <line
                  x1={point.x}
                  y1={point.y}
                  x2={point.x}
                  y2={
                    padding +
                    ((maxValue - point.corrected_viscosity_seconds) / Math.max(maxValue - minValue, 1)) *
                      usableHeight
                  }
                  stroke={point.corrected_viscosity_seconds >= 48 && point.corrected_viscosity_seconds <= 52 ? '#16a34a' : '#7c3aed'}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={point.x}
                  cy={
                    padding +
                    ((maxValue - point.corrected_viscosity_seconds) / Math.max(maxValue - minValue, 1)) *
                      usableHeight
                  }
                  r="4"
                  fill={point.corrected_viscosity_seconds >= 48 && point.corrected_viscosity_seconds <= 52 ? '#16a34a' : '#7c3aed'}
                  onMouseEnter={(event) =>
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      lines: [
                        `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                        `Viscosidade apos correcao: ${formatViscosity(point.corrected_viscosity_seconds)}`,
                        point.corrected_viscosity_seconds >= 48 && point.corrected_viscosity_seconds <= 52
                          ? 'Status: corrigido para faixa ideal'
                          : 'Status: ainda fora da faixa',
                      ],
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              </>
            ) : null}
            <text x={point.x - 16} y={height - 8} fontSize="10" fill="#475569">
              {String(point.analysis_time || '').slice(0, 5)}
            </text>
          </g>
        ))}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  )
}

function parseViscosityInput(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  if (raw.includes(':')) {
    const [minutesPart, secondsPartRaw] = raw.split(':')
    const minutes = Number(minutesPart)
    const seconds = Number(String(secondsPartRaw).replace(',', '.'))
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return null
    }
    return minutes * 60 + seconds
  }

  const numeric = Number(raw.replace(',', '.'))
  return Number.isNaN(numeric) ? null : numeric
}

function normalizeViscosityMask(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  if (digits.length <= 2) {
    return digits
  }
  if (digits.length <= 4) {
    const seconds = digits.slice(0, -2)
    const centiseconds = digits.slice(-2)
    return `${Number(seconds)}.${centiseconds}`
  }
  const minutes = digits.slice(0, -4)
  const seconds = digits.slice(-4, -2).padStart(2, '0')
  const centiseconds = digits.slice(-2)
  return `${Number(minutes)}:${seconds}.${centiseconds}`
}

function parseGramInput(value) {
  const raw = String(value || '').trim().replace(',', '.')
  if (!raw) {
    return null
  }
  const numeric = Number(raw)
  return Number.isNaN(numeric) ? null : numeric
}

function normalizeGramMask(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  const normalized = digits.padStart(3, '0')
  const integerPart = normalized.slice(0, -2).replace(/^0+(?=\d)/, '') || '0'
  const decimalPart = normalized.slice(-2)
  return `${integerPart},${decimalPart}`
}

function AdditionsLinesChart({ data }) {
  const width = 760
  const height = 220
  const padding = 32
  const [tooltip, setTooltip] = useState(null)
  const sorted = [...data].reverse()
  const values = sorted.flatMap((item) => [
    Number(item.solvent_amount || 0),
    Number(item.paint_amount || 0),
  ])
  const maxValue = Math.max(1, ...values)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Sem dados ainda para o grafico de adicoes.
      </div>
    )
  }

  const solventPoints = sorted.map((item, index) => {
    const x = padding + (usableWidth * index) / Math.max(sorted.length - 1, 1)
    const y = padding + ((maxValue - Number(item.solvent_amount || 0)) / Math.max(maxValue, 1)) * usableHeight
    return { ...item, x, y }
  })
  const paintPoints = sorted.map((item, index) => {
    const x = padding + (usableWidth * index) / Math.max(sorted.length - 1, 1)
    const y = padding + ((maxValue - Number(item.paint_amount || 0)) / Math.max(maxValue, 1)) * usableHeight
    return { ...item, x, y }
  })
  const solventPath = solventPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const paintPath = paintPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        <rect x="0" y="0" width={width} height={height} fill="#fff" />
        {[0, maxValue / 2, maxValue].map((value) => {
          const y = padding + ((maxValue - value) / Math.max(maxValue, 1)) * usableHeight
          return (
            <g key={value}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x="4" y={y + 4} fontSize="10" fill="#475569">
                {value.toFixed(2)}
              </text>
            </g>
          )
        })}
        <path d={solventPath} fill="none" stroke="#2563eb" strokeWidth="3" />
        <path d={paintPath} fill="none" stroke="#ea580c" strokeWidth="3" />
        {solventPoints.map((point) => (
          <g key={`solvent-${point.id}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#2563eb"
              onMouseEnter={(event) =>
                setTooltip({
                  x: event.clientX,
                  y: event.clientY,
                  lines: [
                    `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                    `Solvente: ${point.solvent_amount ?? 0}`,
                    `Viscosidade: ${formatViscosity(point.viscosity_seconds)}`,
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            <text x={point.x - 12} y={height - 8} fontSize="10" fill="#475569">
              {String(point.analysis_time || '').slice(0, 5)}
            </text>
          </g>
        ))}
        {paintPoints.map((point) => (
          <g key={`paint-${point.id}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#ea580c"
              onMouseEnter={(event) =>
                setTooltip({
                  x: event.clientX,
                  y: event.clientY,
                  lines: [
                    `${point.analysis_date} ${point.analysis_time || ''}`.trim(),
                    `Tinta: ${point.paint_amount ?? 0}`,
                    `Viscosidade: ${formatViscosity(point.viscosity_seconds)}`,
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          </g>
        ))}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  )
}

function formatViscosity(valueInSeconds) {
  if (valueInSeconds == null || Number.isNaN(Number(valueInSeconds))) {
    return '-'
  }
  const total = Number(valueInSeconds)
  if (total >= 60) {
    const minutes = Math.floor(total / 60)
    const seconds = (total - minutes * 60).toFixed(2).padStart(5, '0')
    return `${minutes}:${seconds}s`
  }
  return `${total.toFixed(2)}s`
}

function getStoredAuth() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : { token: '', user: null }
  } catch {
    return { token: '', user: null }
  }
}

function getOrCreateDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY)
    if (existing) {
      return existing
    }
    const generated =
      window.crypto?.randomUUID?.() ||
      `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(DEVICE_STORAGE_KEY, generated)
    return generated
  } catch {
    return `device-fallback-${Date.now()}`
  }
}

async function api(path, { token, headers, ...options } = {}) {
  const deviceId = getOrCreateDeviceId()
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Device-Id': deviceId,
      ...headers,
    },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(body.detail || 'Erro ao comunicar com o servidor')
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function Card({ title, value, tone = 'default' }) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 border-red-200'
      : tone === 'warn'
        ? 'bg-amber-50 border-amber-200'
        : tone === 'ok'
          ? 'bg-brand-50 border-brand-200'
          : 'bg-white border-slate-200'

  return (
    <div className={`rounded-2xl border p-4 shadow-panel ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-slate-800">{value}</p>
    </div>
  )
}

function Badge({ children, status }) {
  const css =
    status === 'VENCIDO'
      ? 'bg-red-100 text-red-700'
      : status === 'VENCE EM <= 30 DIAS'
        ? 'bg-amber-100 text-amber-800'
        : status === 'ATENCAO (31-60 DIAS)'
          ? 'bg-orange-100 text-orange-700'
          : status === 'AGUARDANDO RECEBIMENTO'
            ? 'bg-slate-200 text-slate-700'
          : 'bg-emerald-100 text-emerald-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${css}`}>{children}</span>
}

function Input({ label, extraSuggestions = [], ...props }) {
  const inputType = props.type || 'text'
  const suggestionsKey = `suggestions:${label}`
  const listId = suggestionsKey.replace(/[^a-zA-Z0-9_-]/g, '-')
  const supportsSuggestions = !['date', 'number', 'password'].includes(inputType)
  const [suggestions, setSuggestions] = useState([])

  useEffect(() => {
    if (!supportsSuggestions) {
      return
    }
    try {
      const saved = window.localStorage.getItem(suggestionsKey)
      setSuggestions(saved ? JSON.parse(saved) : [])
    } catch {
      setSuggestions([])
    }
  }, [supportsSuggestions, suggestionsKey])

  function handleBlur(event) {
    props.onBlur?.(event)
    if (!supportsSuggestions) {
      return
    }
    const value = event.target.value.trim()
    if (!value) {
      return
    }
    const updated = [value, ...suggestions.filter((item) => item !== value)].slice(0, 8)
    setSuggestions(updated)
    window.localStorage.setItem(suggestionsKey, JSON.stringify(updated))
  }

  const mergedSuggestions = Array.from(new Set([...extraSuggestions, ...suggestions])).slice(0, 12)

  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        {...props}
        list={supportsSuggestions ? listId : undefined}
        onBlur={handleBlur}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 transition focus:border-brand-500 focus:ring"
      />
      {supportsSuggestions ? (
        <datalist id={listId}>
          {mergedSuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
    </label>
  )
}

function Select({ label, children, ...props }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <select
        {...props}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 transition focus:border-brand-500 focus:ring"
      >
        {children}
      </select>
    </label>
  )
}

function SearchableProductSelect({
  label,
  searchValue,
  onSearchChange,
  value,
  onChange,
  options,
}) {
  return (
    <div className="space-y-3">
      <Input
        label={`${label} - pesquisar`}
        placeholder="Digite Nº Item ou nome do produto"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <Select label={label} required value={value} onChange={onChange}>
        <option value="">Selecione</option>
        {options.map((product) => (
          <option key={product.id} value={product.id}>
            {product.code} - {product.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function EmptyPurchaseItem() {
  return {
    product_id: '',
    purchase_quantity: '',
    notes: '',
    search: '',
  }
}

function Section({ title, subtitle, actions, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function LoginScreen({ loginForm, onChange, onSubmit, loading, error }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e8fff4,_#f8fafc_45%,_#eef2ff)] p-4">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr,0.9fr]">
        <section className="rounded-[2rem] bg-slate-900 p-8 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">WEG</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">Controle de Tintas e Inflamaveis</h1>
          <p className="mt-4 max-w-xl text-sm text-slate-200">
            Acesso separado para almoxarifado e area tecnica. O almoxarife confere deposito e movimenta estoque. A area tecnica cadastra produtos e registra compras.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-bold text-white">Perfil almoxarife</p>
              <p className="mt-2">Usuario: almoxarife</p>
              <p>Senha inicial: almox123</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-bold text-white">Perfil area tecnica</p>
              <p className="mt-2">Usuario: tecnico</p>
              <p>Senha inicial: tecnica123</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-2xl font-black text-slate-800">Entrar</h2>
          <p className="mt-2 text-sm text-slate-500">Use um dos acessos para liberar as funcoes conforme o perfil.</p>
          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <Input label="Usuario" value={loginForm.username} onChange={(e) => onChange({ ...loginForm, username: e.target.value })} />
            <Input label="Senha" type="password" value={loginForm.password} onChange={(e) => onChange({ ...loginForm, password: e.target.value })} />
            {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
            <button className="rounded-xl bg-brand-500 px-4 py-3 font-bold text-white disabled:opacity-70" disabled={loading} type="submit">
              {loading ? 'Entrando...' : 'Acessar sistema'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export default function App() {
  const initialAuth = getStoredAuth()

  const [activeTab, setActiveTab] = useState('painel')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authToken, setAuthToken] = useState(initialAuth.token || '')
  const [currentUser, setCurrentUser] = useState(initialAuth.user || null)

  const [dashboard, setDashboard] = useState({
    total_products: 0,
    total_lots: 0,
    total_units: 0,
    expired: 0,
    expiring_30: 0,
    expiring_60: 0,
    below_minimum: 0,
  })
  const [products, setProducts] = useState([])
  const [lots, setLots] = useState([])
  const [movements, setMovements] = useState([])
  const [stock, setStock] = useState([])
  const [tankAnalyses, setTankAnalyses] = useState([])
  const [solidContentAnalyses, setSolidContentAnalyses] = useState([])
  const [people, setPeople] = useState([])
  const [reasons, setReasons] = useState([])
  const [users, setUsers] = useState([])
  const [emailRecipients, setEmailRecipients] = useState([])
  const [expiryEmailDraft, setExpiryEmailDraft] = useState(null)
  const [emailSettings, setEmailSettings] = useState({
    enabled: false,
    viscosity_alert_enabled: true,
    expiry_alert_enabled: true,
    expiry_days: 30,
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    use_tls: true,
    sender_name: '',
    sender_email: '',
    has_password: false,
  })

  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [productSearch, setProductSearch] = useState('')
  const [lotSearch, setLotSearch] = useState('')
  const [stockSearch, setStockSearch] = useState('')
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingPersonId, setEditingPersonId] = useState(null)
  const [movementPurchaseSearch, setMovementPurchaseSearch] = useState('')
  const [movementProductSearch, setMovementProductSearch] = useState('')
  const [personForm, setPersonForm] = useState({
    name: '',
    type: 'RESPONSAVEL',
    active: true,
    notes: '',
  })
  const [editingReasonId, setEditingReasonId] = useState(null)
  const [reasonForm, setReasonForm] = useState({
    name: '',
    type: 'ENTRADA',
    active: true,
    notes: '',
  })
  const [editingUserId, setEditingUserId] = useState(null)
  const [userForm, setUserForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'ALMOXARIFE',
    active: true,
  })
  const [editingRecipientId, setEditingRecipientId] = useState(null)
  const [recipientForm, setRecipientForm] = useState({
    name: '',
    email: '',
    active: true,
    notes: '',
  })
  const [controlTab, setControlTab] = useState('cadastros')

  function openMailDraft(draft) {
    if (!draft || !draft.recipients?.length) {
      return
    }
    const recipientList = draft.recipients.join(';')
    const subject = encodeURIComponent(draft.subject || '')
    const body = encodeURIComponent(draft.body || '')
    const href = `mailto:${recipientList}?subject=${subject}&body=${body}`
    window.location.href = href
  }
  const [tankForm, setTankForm] = useState({
    analysis_date: todayISO,
    analysis_time: getCurrentTimeHHMM(),
    viscosity_input: '',
    corrected_viscosity_input: '',
    solvent_amount: '',
    paint_amount: '',
    notes: '',
    responsible: '',
  })
  const [tankMainTab, setTankMainTab] = useState('viscosidade')
  const [tankViewTab, setTankViewTab] = useState('viscosidade')
  const [solidForm, setSolidForm] = useState({
    analysis_date: todayISO,
    analysis_time: getCurrentTimeHHMM(),
    capsule1_empty_weight: '',
    capsule1_wet_weight: '',
    capsule1_dry_weight: '',
    capsule2_empty_weight: '',
    capsule2_wet_weight: '',
    capsule2_dry_weight: '',
    capsule3_empty_weight: '',
    capsule3_wet_weight: '',
    capsule3_dry_weight: '',
    notes: '',
    responsible: '',
  })

  const emptyProductForm = {
    code: '',
    name: '',
    category: 'TINTA',
    unit: 'L',
    minimum_stock: 0,
    storage_location: '',
    notes: '',
  }

  const [productForm, setProductForm] = useState(emptyProductForm)
  const [lotForm, setLotForm] = useState({
    code: '',
    supplier_type: 'WEG',
    external_supplier: '',
    items: [EmptyPurchaseItem()],
  })
  const [movementForm, setMovementForm] = useState({
    lot_id: '',
    product_id: '',
    type: 'ENTRADA',
    movement_date: todayISO,
    movement_time: getCurrentTimeHHMM(),
    shift: inferShiftFromTime(getCurrentTimeHHMM()),
    is_overtime: false,
    quantity: '',
    manufacture_date: '',
    expiry_date: '',
    responsible: '',
    destination_reason: '',
    notes: '',
  })

  const isTechnical = currentUser?.role === 'AREA_TECNICA'
  const visibleTabs = isTechnical
    ? tabs
    : tabs.filter((tab) => tab.id === 'painel' || tab.id === 'movimentacoes' || tab.id === 'estoque' || tab.id === 'tanque')

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toUpperCase()
    if (!term) {
      return products
    }
    return products.filter(
      (product) =>
        product.code.toUpperCase().includes(term) ||
        product.name.toUpperCase().includes(term),
    )
  }, [products, productSearch])

  const filteredLots = useMemo(() => {
    const term = lotSearch.trim().toUpperCase()
    if (!term) {
      return lots
    }
    return lots.filter(
      (lot) =>
        lot.product_code.toUpperCase().includes(term) ||
        lot.product_name.toUpperCase().includes(term) ||
        lot.code.toUpperCase().includes(term),
    )
  }, [lots, lotSearch])

  const filteredStock = useMemo(() => {
    const term = stockSearch.trim().toUpperCase()
    if (!term) {
      return stock
    }
    return stock.filter(
      (item) =>
        item.product_code.toUpperCase().includes(term) ||
        item.product_name.toUpperCase().includes(term) ||
        item.lot_code.toUpperCase().includes(term),
    )
  }, [stock, stockSearch])

  const filteredMovementLots = useMemo(() => {
    const term = movementPurchaseSearch.trim().toUpperCase()
    if (!term) {
      return lots
    }
    return lots.filter(
      (lot) =>
        lot.product_code.toUpperCase().includes(term) ||
        lot.product_name.toUpperCase().includes(term) ||
        lot.code.toUpperCase().includes(term),
    )
  }, [lots, movementPurchaseSearch])

  const filteredMovementProducts = useMemo(() => {
    const term = movementProductSearch.trim().toUpperCase()
    if (!term) {
      return products
    }
    return products.filter(
      (product) =>
        product.code.toUpperCase().includes(term) ||
        product.name.toUpperCase().includes(term),
    )
  }, [products, movementProductSearch])

  const selectedMovementPurchase = useMemo(
    () => lots.find((lot) => lot.id === Number(movementForm.lot_id)) || null,
    [lots, movementForm.lot_id],
  )

  const selectedMovementProduct = useMemo(
    () => products.find((product) => product.id === Number(movementForm.product_id)) || null,
    [products, movementForm.product_id],
  )

  const groupedPurchases = useMemo(() => {
    const groups = new Map()
    for (const purchase of filteredLots) {
      const existing = groups.get(purchase.code)
      if (existing) {
        existing.items.push(purchase)
        continue
      }
      groups.set(purchase.code, {
        code: purchase.code,
        supplierLabel:
          purchase.supplier_type === 'WEG' ? 'WEG' : purchase.external_supplier || '-',
        items: [purchase],
      })
    }
    return Array.from(groups.values())
  }, [filteredLots])

  const almoxarifePeople = useMemo(
    () => people.filter((person) => person.type === 'ALMOXARIFE' && person.active),
    [people],
  )

  const responsiblePeople = useMemo(
    () => people.filter((person) => person.type === 'RESPONSAVEL' && person.active),
    [people],
  )

  const allActivePeople = useMemo(
    () => people.filter((person) => person.active),
    [people],
  )

  const entradaReasons = useMemo(
    () => reasons.filter((reason) => reason.type === 'ENTRADA' && reason.active),
    [reasons],
  )

  const saidaReasons = useMemo(
    () => reasons.filter((reason) => reason.type === 'SAIDA' && reason.active),
    [reasons],
  )

  const tankViscositySeconds = useMemo(
    () => parseViscosityInput(tankForm.viscosity_input),
    [tankForm.viscosity_input],
  )

  const correctedTankViscositySeconds = useMemo(
    () => parseViscosityInput(tankForm.corrected_viscosity_input),
    [tankForm.corrected_viscosity_input],
  )

  const tankViscosityStatus = useMemo(() => {
    if (tankViscositySeconds == null) {
      return null
    }
    if (tankViscositySeconds < 48) {
      return 'BAIXA'
    }
    if (tankViscositySeconds > 52) {
      return 'ALTA'
    }
    return 'OK'
  }, [tankViscositySeconds])

  const shouldShowCorrectedViscosity =
    tankViscosityStatus && tankViscosityStatus !== 'OK'

  const correctedTankViscosityStatus = useMemo(() => {
    if (correctedTankViscositySeconds == null) {
      return null
    }
    if (correctedTankViscositySeconds < 48) {
      return 'BAIXA'
    }
    if (correctedTankViscositySeconds > 52) {
      return 'ALTA'
    }
    return 'OK'
  }, [correctedTankViscositySeconds])

  const solidCapsuleResults = useMemo(() => {
    return [1, 2, 3].map((capsule) => {
      const empty = parseGramInput(solidForm[`capsule${capsule}_empty_weight`])
      const wet = parseGramInput(solidForm[`capsule${capsule}_wet_weight`])
      const dry = parseGramInput(solidForm[`capsule${capsule}_dry_weight`])

      if (empty == null || wet == null || dry == null || wet <= 0 || dry <= empty) {
        return null
      }

      return Number((((dry - empty) / wet) * 100).toFixed(2))
    })
  }, [solidForm])

  const solidAverageResult = useMemo(() => {
    if (solidCapsuleResults.some((item) => item == null)) {
      return null
    }
    const values = solidCapsuleResults.filter((item) => item != null)
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
  }, [solidCapsuleResults])

  useEffect(() => {
    if (authToken && currentUser) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: authToken, user: currentUser }))
      return
    }
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [authToken, currentUser])

  function resetSession() {
    setAuthToken('')
    setCurrentUser(null)
    setProducts([])
    setLots([])
    setMovements([])
    setStock([])
    setDashboard({
      total_products: 0,
      total_lots: 0,
      total_units: 0,
      expired: 0,
      expiring_30: 0,
      expiring_60: 0,
      below_minimum: 0,
    })
    setActiveTab('painel')
  }

  async function safeApi(path, options = {}) {
    try {
      return await api(path, { token: authToken, ...options })
    } catch (err) {
      if (err.status === 401) {
        resetSession()
        setError('Sua sessao expirou. Entre novamente.')
      }
      throw err
    }
  }

  async function loadAll() {
    if (!authToken) {
      return
    }

    setLoading(true)
    setError('')
    try {
      const requests = [
        safeApi('/dashboard'),
        safeApi('/products'),
        safeApi('/lots'),
        safeApi('/movements'),
        safeApi('/stock'),
        safeApi('/tank-analyses'),
        safeApi('/solid-content-analyses'),
        safeApi('/people'),
        safeApi('/reasons'),
      ]
      if (currentUser?.role === 'AREA_TECNICA') {
        requests.push(safeApi('/users'))
        requests.push(safeApi('/email-settings'))
        requests.push(safeApi('/email-recipients'))
      }
      const [
        d,
        p,
        l,
        m,
        s,
        tankData,
        solidData,
        peopleData,
        reasonsData,
        usersData = [],
        emailSettingsData = {
          enabled: false,
          viscosity_alert_enabled: true,
          expiry_alert_enabled: true,
          expiry_days: 30,
          smtp_host: '',
          smtp_port: 587,
          smtp_username: '',
          use_tls: true,
          sender_name: '',
          sender_email: '',
          has_password: false,
        },
        emailRecipientsData = [],
      ] = await Promise.all(requests)
      setDashboard(d)
      setProducts(p)
      setLots(l)
      setMovements(m)
      setStock(s)
      setTankAnalyses(tankData)
      setSolidContentAnalyses(solidData)
      setPeople(peopleData)
      setReasons(reasonsData)
      setUsers(usersData)
      setEmailSettings((current) => ({
        ...current,
        ...emailSettingsData,
        smtp_password: '',
      }))
      setEmailRecipients(emailRecipientsData)
      if (currentUser?.role === 'AREA_TECNICA') {
        const draft = await safeApi('/email-drafts/expiry').catch(() => null)
        setExpiryEmailDraft(draft)
      } else {
        setExpiryEmailDraft(null)
      }
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authToken) {
      loadAll()
    }
  }, [authToken, currentUser?.role])

  useEffect(() => {
    if (isTechnical) {
      return
    }
    if (activeTab !== 'painel' && activeTab !== 'movimentacoes' && activeTab !== 'estoque' && activeTab !== 'tanque') {
      setActiveTab('painel')
    }
  }, [isTechnical, activeTab])

  useEffect(() => {
    if (!tankForm.responsible && almoxarifePeople.length) {
      setTankForm((current) => ({
        ...current,
        responsible: current.responsible || almoxarifePeople[0].name,
      }))
    }
  }, [almoxarifePeople, tankForm.responsible])

  useEffect(() => {
    if (!solidForm.responsible && almoxarifePeople.length) {
      setSolidForm((current) => ({
        ...current,
        responsible: current.responsible || almoxarifePeople[0].name,
      }))
    }
  }, [almoxarifePeople, solidForm.responsible])

  useEffect(() => {
    setMovementForm((current) => {
      const inferredShift = inferShiftFromTime(current.movement_time)
      const defaultAlmoxarife = almoxarifePeople[0]?.name || 'ALMOXARIFE DE INFLAMAVEIS'
      return {
        ...current,
        shift: current.is_overtime ? current.shift || inferredShift : inferredShift,
        responsible:
          current.type === 'ENTRADA'
            ? current.responsible
            : defaultAlmoxarife,
        destination_reason:
          current.type === 'ENTRADA'
            ? current.destination_reason
            : current.destination_reason,
      }
    })
  }, [movementForm.movement_time, movementForm.type, movementForm.is_overtime, almoxarifePeople])

  useEffect(() => {
    if (movementForm.type !== 'ENTRADA') {
      return
    }

    const selectedPurchase = lots.find((lot) => lot.id === Number(movementForm.lot_id))
    if (!selectedPurchase) {
      return
    }

    setMovementForm((current) => {
      const suggestedQuantity =
        current.quantity && Number(current.quantity) > 0
          ? current.quantity
          : String(selectedPurchase.remaining_quantity || selectedPurchase.purchase_quantity || '')
      return {
        ...current,
        quantity: suggestedQuantity,
        manufacture_date: current.manufacture_date || selectedPurchase.manufacture_date || '',
        expiry_date: current.expiry_date || selectedPurchase.expiry_date || '',
        responsible: current.responsible || responsiblePeople[0]?.name || currentUser?.full_name || '',
        destination_reason: current.destination_reason || entradaReasons[0]?.name || 'RECEBIMENTO DE COMPRA',
        notes:
          current.notes ||
          `Nota ${selectedPurchase.code} - ${selectedPurchase.product_code} - ${selectedPurchase.product_name}`,
      }
    })
  }, [movementForm.type, movementForm.lot_id, lots, currentUser, responsiblePeople, entradaReasons])

  async function submitLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })
      setAuthToken(data.token)
      setCurrentUser(data.user)
      setLoginForm({ username: '', password: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try {
      if (authToken) {
        await api('/logout', { method: 'POST', token: authToken })
      }
    } catch {
      // Mesmo com erro de logout, a sessao local deve ser encerrada.
    } finally {
      resetSession()
    }
  }

  function startEditProduct(product) {
    setEditingProductId(product.id)
    setProductForm({
      code: product.code,
      name: product.name,
      category: product.category,
      unit: product.unit,
      minimum_stock: product.minimum_stock,
      storage_location: product.storage_location || '',
      notes: product.notes || '',
    })
    setActiveTab('produtos')
  }

  function cancelEditProduct() {
    setEditingProductId(null)
    setProductForm(emptyProductForm)
  }

  function startEditPerson(person) {
    setEditingPersonId(person.id)
    setPersonForm({
      name: person.name,
      type: person.type,
      active: person.active,
      notes: person.notes || '',
    })
    setActiveTab('controle')
  }

  function cancelEditPerson() {
    setEditingPersonId(null)
    setPersonForm({
      name: '',
      type: 'RESPONSAVEL',
      active: true,
      notes: '',
    })
  }

  function startEditReason(reason) {
    setEditingReasonId(reason.id)
    setReasonForm({
      name: reason.name,
      type: reason.type,
      active: reason.active,
      notes: reason.notes || '',
    })
    setActiveTab('controle')
  }

  function cancelEditReason() {
    setEditingReasonId(null)
    setReasonForm({
      name: '',
      type: 'ENTRADA',
      active: true,
      notes: '',
    })
  }

  function startEditUser(user) {
    setEditingUserId(user.id)
    setUserForm({
      username: user.username,
      full_name: user.full_name,
      password: '',
      role: user.role,
      active: user.active,
    })
    setActiveTab('controle')
  }

  function cancelEditUser() {
    setEditingUserId(null)
    setUserForm({
      username: '',
      full_name: '',
      password: '',
      role: 'ALMOXARIFE',
      active: true,
    })
  }

  function startEditRecipient(recipient) {
    setEditingRecipientId(recipient.id)
    setRecipientForm({
      name: recipient.name || '',
      email: recipient.email,
      active: recipient.active,
      notes: recipient.notes || '',
    })
    setActiveTab('controle')
  }

  function cancelEditRecipient() {
    setEditingRecipientId(null)
    setRecipientForm({
      name: '',
      email: '',
      active: true,
      notes: '',
    })
  }

  function updatePurchaseItem(index, patch) {
    setLotForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  function addPurchaseItem() {
    setLotForm((current) => ({
      ...current,
      items: [...current.items, EmptyPurchaseItem()],
    }))
  }

  function removePurchaseItem(index) {
    setLotForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [EmptyPurchaseItem()]
          : current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  async function submitProduct(e) {
    e.preventDefault()
    try {
      const payload = { ...productForm, minimum_stock: Number(productForm.minimum_stock || 0) }
      if (editingProductId) {
        await safeApi(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await safeApi('/products', { method: 'POST', body: JSON.stringify(payload) })
      }
      cancelEditProduct()
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitPerson(e) {
    e.preventDefault()
    try {
      const payload = {
        ...personForm,
        active: Boolean(personForm.active),
      }
      if (editingPersonId) {
        await safeApi(`/people/${editingPersonId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await safeApi('/people', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      cancelEditPerson()
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitReason(e) {
    e.preventDefault()
    try {
      const payload = {
        ...reasonForm,
        active: Boolean(reasonForm.active),
      }
      if (editingReasonId) {
        await safeApi(`/reasons/${editingReasonId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await safeApi('/reasons', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      cancelEditReason()
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitUser(e) {
    e.preventDefault()
    try {
      const payload = {
        ...userForm,
        active: Boolean(userForm.active),
      }
      if (editingUserId) {
        await safeApi(`/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await safeApi('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      cancelEditUser()
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitEmailSettings(e) {
    e.preventDefault()
    try {
      const payload = {
        ...emailSettings,
        smtp_port: Number(emailSettings.smtp_port || 587),
      }
      const data = await safeApi('/email-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setEmailSettings((current) => ({
        ...current,
        ...data,
        smtp_password: '',
      }))
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitRecipient(e) {
    e.preventDefault()
    try {
      if (editingRecipientId) {
        await safeApi(`/email-recipients/${editingRecipientId}`, {
          method: 'PUT',
          body: JSON.stringify(recipientForm),
        })
      } else {
        await safeApi('/email-recipients', {
          method: 'POST',
          body: JSON.stringify(recipientForm),
        })
      }
      cancelEditRecipient()
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitTankAnalysis(e) {
    e.preventDefault()
    try {
      const viscositySeconds = parseViscosityInput(tankForm.viscosity_input)
      if (viscositySeconds == null || viscositySeconds <= 0) {
        setError('Informe a viscosidade em segundos, centesimos ou mm:ss.cc')
        return
      }
      const savedAnalysis = await safeApi('/tank-analyses', {
        method: 'POST',
        body: JSON.stringify({
          analysis_date: tankForm.analysis_date,
          analysis_time: tankForm.analysis_time,
          viscosity_seconds: viscositySeconds,
          corrected_viscosity_seconds:
            shouldShowCorrectedViscosity && correctedTankViscositySeconds
              ? correctedTankViscositySeconds
              : null,
          solvent_amount: tankForm.solvent_amount === '' ? null : Number(tankForm.solvent_amount),
          paint_amount: tankForm.paint_amount === '' ? null : Number(tankForm.paint_amount),
          level_amount: null,
          notes: tankForm.notes,
          responsible: tankForm.responsible,
        }),
      })
      setTankForm({
        analysis_date: todayISO,
        analysis_time: getCurrentTimeHHMM(),
        viscosity_input: '',
        corrected_viscosity_input: '',
        solvent_amount: '',
        paint_amount: '',
        notes: '',
        responsible: almoxarifePeople[0]?.name || '',
      })
      if (!savedAnalysis.in_target_range) {
        const draft = await safeApi(`/email-drafts/tank/${savedAnalysis.id}`).catch(() => null)
        if (draft) {
          openMailDraft(draft)
        }
      }
      await loadAll()
      setActiveTab('tanque')
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitSolidContentAnalysis(e) {
    e.preventDefault()
    try {
      await safeApi('/solid-content-analyses', {
        method: 'POST',
        body: JSON.stringify({
          analysis_date: solidForm.analysis_date,
          analysis_time: solidForm.analysis_time,
          capsule1: {
            empty_weight: parseGramInput(solidForm.capsule1_empty_weight),
            wet_weight: parseGramInput(solidForm.capsule1_wet_weight),
            dry_weight: parseGramInput(solidForm.capsule1_dry_weight),
          },
          capsule2: {
            empty_weight: parseGramInput(solidForm.capsule2_empty_weight),
            wet_weight: parseGramInput(solidForm.capsule2_wet_weight),
            dry_weight: parseGramInput(solidForm.capsule2_dry_weight),
          },
          capsule3: {
            empty_weight: parseGramInput(solidForm.capsule3_empty_weight),
            wet_weight: parseGramInput(solidForm.capsule3_wet_weight),
            dry_weight: parseGramInput(solidForm.capsule3_dry_weight),
          },
          notes: solidForm.notes,
          responsible: solidForm.responsible,
        }),
      })
      setSolidForm({
        analysis_date: todayISO,
        analysis_time: getCurrentTimeHHMM(),
        capsule1_empty_weight: '',
        capsule1_wet_weight: '',
        capsule1_dry_weight: '',
        capsule2_empty_weight: '',
        capsule2_wet_weight: '',
        capsule2_dry_weight: '',
        capsule3_empty_weight: '',
        capsule3_wet_weight: '',
        capsule3_dry_weight: '',
        notes: '',
        responsible: almoxarifePeople[0]?.name || '',
      })
      await loadAll()
      setActiveTab('tanque')
      setTankMainTab('solidos')
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function removeProduct(product) {
    const confirmed = window.confirm(`Excluir o produto ${product.code} - ${product.name}?`)
    if (!confirmed) {
      return
    }

    try {
      await safeApi(`/products/${product.id}`, { method: 'DELETE' })
      if (editingProductId === product.id) {
        cancelEditProduct()
      }
      await loadAll()
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitLot(e) {
    e.preventDefault()
    try {
      await safeApi('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          code: lotForm.code,
          supplier_type: lotForm.supplier_type,
          external_supplier:
            lotForm.supplier_type === 'EXTERNO' ? lotForm.external_supplier : null,
          items: lotForm.items.map((item) => ({
            product_id: Number(item.product_id),
            purchase_quantity: Number(item.purchase_quantity),
            notes: item.notes || null,
          })),
        }),
      })
      setLotForm({
        code: '',
        supplier_type: 'WEG',
        external_supplier: '',
        items: [EmptyPurchaseItem()],
      })
      await loadAll()
      setActiveTab('lotes')
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  async function submitMovement(e) {
    e.preventDefault()
    try {
      await safeApi('/movements', {
        method: 'POST',
        body: JSON.stringify({
          ...movementForm,
          lot_id: movementForm.lot_id ? Number(movementForm.lot_id) : null,
          product_id: movementForm.product_id ? Number(movementForm.product_id) : null,
          quantity: Number(movementForm.quantity),
          manufacture_date: movementForm.manufacture_date || null,
          expiry_date: movementForm.expiry_date || null,
        }),
      })
      setMovementForm({
        lot_id: '',
        product_id: '',
        type: 'ENTRADA',
        movement_date: todayISO,
        movement_time: getCurrentTimeHHMM(),
        shift: inferShiftFromTime(getCurrentTimeHHMM()),
        is_overtime: false,
        quantity: '',
        manufacture_date: '',
        expiry_date: '',
        responsible: '',
        destination_reason: '',
        notes: '',
      })
      await loadAll()
      setActiveTab('movimentacoes')
    } catch (err) {
      if (err.status !== 401) {
        setError(err.message)
      }
    }
  }

  function openPrintWindow(title, bodyMarkup) {
    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      setError('Nao foi possivel abrir a janela de impressao.')
      return
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
      h1 { font-size: 22px; margin: 0 0 8px; }
      h2 { font-size: 16px; margin: 24px 0 8px; }
      p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; }
      .meta { margin-bottom: 16px; font-size: 12px; color: #475569; }
      .line { height: 20px; border-bottom: 1px solid #cbd5e1; }
      .checkbox { width: 18px; height: 18px; border: 1px solid #334155; display: inline-block; }
      .group { margin-bottom: 28px; page-break-inside: avoid; }
      @media print {
        body { margin: 12px; }
      }
    </style>
  </head>
  <body>
    ${bodyMarkup}
  </body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function printPurchaseChecklist() {
    const generatedAt = new Date().toLocaleString('pt-BR')
    const groupsMarkup = groupedPurchases
      .map(
        (group) => `
          <section class="group">
            <h2>Nota de compra ${group.code}</h2>
            <p><strong>Fornecedor:</strong> ${group.supplierLabel}</p>
            <table>
              <thead>
                <tr>
                  <th>Conferido</th>
                  <th>Nº Item</th>
                  <th>Produto</th>
                  <th>Qtd. comprada</th>
                  <th>Fabricacao</th>
                  <th>Validade</th>
                  <th>Qtd. recebida</th>
                  <th>Observacoes</th>
                </tr>
              </thead>
              <tbody>
                ${group.items
                  .map(
                    (item) => `
                      <tr>
                        <td><span class="checkbox"></span></td>
                        <td>${item.product_code}</td>
                        <td>${item.product_name}</td>
                        <td>${item.purchase_quantity}</td>
                        <td class="line"></td>
                        <td class="line"></td>
                        <td class="line"></td>
                        <td class="line"></td>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </section>
        `,
      )
      .join('')

    openPrintWindow(
      'Checklist de Conferencia de Compras',
      `
        <h1>Checklist de Conferencia de Compras</h1>
        <p class="meta">Gerado em ${generatedAt}</p>
        <table>
          <tbody>
            <tr>
              <th style="width: 180px;">Conferido por</th>
              <td class="line"></td>
              <th style="width: 120px;">Data</th>
              <td class="line"></td>
            </tr>
            <tr>
              <th>Turno</th>
              <td class="line"></td>
              <th>Hora extra</th>
              <td class="line"></td>
            </tr>
            <tr>
              <th>Observacoes gerais</th>
              <td colspan="3" class="line"></td>
            </tr>
          </tbody>
        </table>
        ${groupsMarkup || '<p>Nenhuma compra encontrada para impressao.</p>'}
      `,
    )
  }

  function printStockReport() {
    const generatedAt = new Date().toLocaleString('pt-BR')
    const rowsMarkup = filteredStock
      .map(
        (item) => `
          <tr>
            <td>${item.product_code}</td>
            <td>${item.product_name}</td>
            <td>${item.lot_code}</td>
            <td>${formatPrintDate(item.expiry_date)}</td>
            <td>${item.current_stock} ${item.unit}</td>
            <td>${item.minimum_stock}</td>
            <td>${item.expiry_status}</td>
            <td>${item.below_minimum ? 'ABAIXO DO MINIMO' : 'OK'}</td>
          </tr>
        `,
      )
      .join('')

    openPrintWindow(
      'Relatorio de Estoque',
      `
        <h1>Relatorio de Estoque</h1>
        <p class="meta">Gerado em ${generatedAt}</p>
        <table>
          <thead>
            <tr>
              <th>Nº Item</th>
              <th>Produto</th>
              <th>Nota compra</th>
              <th>Validade</th>
              <th>Saldo</th>
              <th>Minimo</th>
              <th>Status</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>
            ${rowsMarkup || '<tr><td colspan="8">Nenhum item encontrado para impressao.</td></tr>'}
          </tbody>
        </table>
      `,
    )
  }

  if (!authToken || !currentUser) {
    return (
      <LoginScreen
        loginForm={loginForm}
        onChange={setLoginForm}
        onSubmit={submitLogin}
        loading={loading}
        error={error}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8fff4,_#f8fafc_45%,_#eef2ff)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <img
                src={LOGO_SRC}
                alt="Logo WEG"
                className="h-14 w-14 rounded-2xl bg-white p-2 shadow-sm"
              />
              <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Deposito</p>
              <h1 className="mt-2 text-2xl font-black md:text-4xl">Controle de Tintas e Inflamaveis</h1>
              <p className="mt-2 text-sm text-slate-200">Acesso por perfil com permissoes para almoxarifado e area tecnica.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="font-bold text-white">{currentUser.full_name}</p>
              <p className="mt-1 text-slate-200">{currentUser.role === 'AREA_TECNICA' ? 'Area tecnica' : 'Almoxarife'}</p>
              <button className="mt-3 rounded-xl bg-white px-3 py-2 font-bold text-slate-900" onClick={logout} type="button">
                Sair
              </button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-panel md:grid-cols-5">
          {visibleTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTab === tab.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'painel' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Produtos" value={dashboard.total_products} />
              <Card title="Compras" value={dashboard.total_lots} />
              <Card title="Unidades em Estoque" value={dashboard.total_units} tone="ok" />
              <Card title="Abaixo do Minimo" value={dashboard.below_minimum} tone="warn" />
              <Card title="Vencidos" value={dashboard.expired} tone="danger" />
              <Card title="Vence <= 30 dias" value={dashboard.expiring_30} tone="warn" />
              <Card title="Atencao 31-60" value={dashboard.expiring_60} tone="warn" />
            </div>
            <Section title="Acoes rapidas" subtitle="As acoes exibidas mudam conforme o perfil logado.">
              <div className="grid gap-3 md:grid-cols-5">
                {isTechnical ? (
                  <button className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('produtos')}>
                    Cadastrar produto
                  </button>
                ) : (
                  <button className="rounded-xl bg-slate-300 px-4 py-3 text-sm font-bold text-slate-600" disabled>
                    Cadastro de produto bloqueado
                  </button>
                )}
                {isTechnical ? (
                  <button className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('lotes')}>
                    Registrar compra
                  </button>
                ) : (
                  <button className="rounded-xl bg-slate-300 px-4 py-3 text-sm font-bold text-slate-600" disabled>
                    Compra bloqueada
                  </button>
                )}
                <button className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('movimentacoes')}>
                  Lancar movimentacao
                </button>
                <button className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white" onClick={printPurchaseChecklist} type="button">
                  Imprimir checklist
                </button>
                <button className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-white" onClick={printStockReport} type="button">
                  Imprimir estoque
                </button>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'produtos' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section
              title={editingProductId ? 'Editar produto' : 'Novo produto'}
              subtitle={
                isTechnical
                  ? 'A area tecnica pode cadastrar, editar e excluir produtos.'
                  : 'O almoxarife pode consultar, mas nao altera o cadastro de produtos.'
              }
            >
              {isTechnical ? (
                <form className="grid gap-3" onSubmit={submitProduct}>
                  <Input required label="Nº Item" value={productForm.code} onChange={(e) => setProductForm({ ...productForm, code: e.target.value })} />
                  <Input required label="Nome do produto" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Categoria" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                      <option>TINTA</option>
                      <option>INFLAMAVEL</option>
                    </Select>
                    <Select label="Unidade" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}>
                      <option>L</option>
                      <option>KG</option>
                      <option>UN</option>
                    </Select>
                  </div>
                  <Input type="number" step="0.01" label="Estoque minimo" value={productForm.minimum_stock} onChange={(e) => setProductForm({ ...productForm, minimum_stock: e.target.value })} />
                  <Input label="Local de armazenagem" value={productForm.storage_location} onChange={(e) => setProductForm({ ...productForm, storage_location: e.target.value })} />
                  <Input label="Observacoes" value={productForm.notes} onChange={(e) => setProductForm({ ...productForm, notes: e.target.value })} />
                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                      {editingProductId ? 'Salvar alteracoes' : 'Salvar produto'}
                    </button>
                    {editingProductId ? (
                      <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-700" onClick={cancelEditProduct} type="button">
                        Cancelar edicao
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Cadastro bloqueado para este perfil. Use a busca ao lado para localizar por Nº Item.
                </div>
              )}
            </Section>

            <Section
              title="Produtos cadastrados"
              actions={<Input label="Pesquisar por Nº Item" placeholder="Ex.: 000123" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />}
            >
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="p-2">Nº Item</th>
                      <th className="p-2">Nome do produto</th>
                      <th className="p-2">Categoria</th>
                      <th className="p-2">Unid.</th>
                      <th className="p-2">Minimo</th>
                      {isTechnical ? <th className="p-2">Acoes</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-slate-50">
                        <td className="p-2 font-semibold">{product.code}</td>
                        <td className="p-2">{product.name}</td>
                        <td className="p-2">{product.category}</td>
                        <td className="p-2">{product.unit}</td>
                        <td className="p-2">{product.minimum_stock}</td>
                        {isTechnical ? (
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditProduct(product)} type="button">
                                Editar
                              </button>
                              <button className="rounded-lg bg-red-600 px-3 py-1 font-bold text-white" onClick={() => removeProduct(product)} type="button">
                                Excluir
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    {!filteredProducts.length ? (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={isTechnical ? 6 : 5}>
                          Nenhum produto encontrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'lotes' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section title="Nova compra" subtitle="Somente a area tecnica pode registrar compras. Fabricacao e validade ficam para o recebimento.">
              {isTechnical ? (
                <form className="grid gap-3" onSubmit={submitLot}>
                  <Input required label="Codigo da nota de compra" value={lotForm.code} onChange={(e) => setLotForm({ ...lotForm, code: e.target.value })} />
                  <Select
                    label="Fornecedor"
                    value={lotForm.supplier_type}
                    onChange={(e) =>
                      setLotForm({
                        ...lotForm,
                        supplier_type: e.target.value,
                        external_supplier: e.target.value === 'EXTERNO' ? lotForm.external_supplier : '',
                      })
                    }
                  >
                    <option value="WEG">WEG</option>
                    <option value="EXTERNO">Externo</option>
                  </Select>
                  {lotForm.supplier_type === 'EXTERNO' ? (
                    <Input
                      required
                      label="Nome do fornecedor externo"
                      value={lotForm.external_supplier}
                      onChange={(e) => setLotForm({ ...lotForm, external_supplier: e.target.value })}
                    />
                  ) : null}
                  <div className="space-y-4">
                    {lotForm.items.map((item, index) => {
                      const filteredOptions = products.filter(
                        (product) =>
                          !item.search ||
                          product.code.toUpperCase().includes(item.search.trim().toUpperCase()) ||
                          product.name.toUpperCase().includes(item.search.trim().toUpperCase()),
                      )

                      return (
                        <div key={index} className="rounded-2xl border border-slate-200 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="font-bold text-slate-800">Item da compra {index + 1}</p>
                            <button className="rounded-lg bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700" onClick={() => removePurchaseItem(index)} type="button">
                              Remover
                            </button>
                          </div>
                          <div className="grid gap-3">
                            <SearchableProductSelect
                              label="Produto"
                              searchValue={item.search}
                              onSearchChange={(value) => updatePurchaseItem(index, { search: value })}
                              value={item.product_id}
                              onChange={(e) => updatePurchaseItem(index, { product_id: e.target.value })}
                              options={filteredOptions}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                required
                                type="number"
                                step="0.01"
                                label="Quantidade comprada"
                                value={item.purchase_quantity}
                                onChange={(e) => updatePurchaseItem(index, { purchase_quantity: e.target.value })}
                              />
                            </div>
                            <Input
                              label="Observacoes do item"
                              value={item.notes}
                              onChange={(e) => updatePurchaseItem(index, { notes: e.target.value })}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-800" onClick={addPurchaseItem} type="button">
                    Adicionar outro item na nota
                  </button>
                  <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar compra</button>
                </form>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Registro de compra bloqueado para este perfil.
                </div>
              )}
            </Section>

            <Section
              title="Compras cadastradas"
              actions={
                isTechnical ? (
                  <Input label="Pesquisar por Nº Item" placeholder="Nº Item ou nota de compra" value={lotSearch} onChange={(e) => setLotSearch(e.target.value)} />
                ) : null
              }
            >
              {isTechnical ? (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-100 text-left">
                        <th className="p-2">Produto</th>
                        <th className="p-2">Nota de compra</th>
                        <th className="p-2">Qtd. comprada</th>
                        <th className="p-2">Qtd. recebida</th>
                        <th className="p-2">Validade</th>
                        <th className="p-2">Fornecedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLots.map((lot) => (
                        <tr key={lot.id} className="border-b hover:bg-slate-50">
                          <td className="p-2">{lot.product_code} - {lot.product_name}</td>
                          <td className="p-2 font-semibold">{lot.code}</td>
                          <td className="p-2">{lot.purchase_quantity}</td>
                          <td className="p-2">{lot.received_quantity}</td>
                          <td className="p-2">{lot.expiry_date || '-'}</td>
                          <td className="p-2">{lot.supplier_type === 'WEG' ? 'WEG' : lot.external_supplier || '-'}</td>
                        </tr>
                      ))}
                      {!filteredLots.length ? (
                        <tr>
                          <td className="p-3 text-slate-500" colSpan={6}>
                            Nenhuma compra encontrada.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Visualizacao de compras bloqueada para este perfil.
                </div>
              )}
            </Section>
          </div>
        )}

        {activeTab === 'movimentacoes' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section
              title="Nova movimentacao"
              subtitle="Recebimento para conferencia, saida para uso ou descarte."
              actions={
                <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white" onClick={printPurchaseChecklist} type="button">
                  Imprimir checklist de conferencia
                </button>
              }
            >
              <form className="grid gap-3" onSubmit={submitMovement}>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Tipo"
                    value={movementForm.type}
                    onChange={(e) =>
                      setMovementForm({
                        ...movementForm,
                        type: e.target.value,
                        lot_id: e.target.value === 'ENTRADA' ? movementForm.lot_id : '',
                        product_id: e.target.value === 'ENTRADA' ? '' : movementForm.product_id,
                        manufacture_date: e.target.value === 'ENTRADA' ? movementForm.manufacture_date : '',
                        expiry_date: e.target.value === 'ENTRADA' ? movementForm.expiry_date : '',
                        responsible:
                          e.target.value === 'ENTRADA'
                            ? ''
                            : almoxarifePeople[0]?.name || 'ALMOXARIFE DE INFLAMAVEIS',
                        destination_reason:
                          e.target.value === 'ENTRADA'
                            ? entradaReasons[0]?.name || ''
                            : saidaReasons[0]?.name || '',
                      })
                    }
                  >
                    <option>ENTRADA</option>
                    <option>SAIDA_USO</option>
                    <option>SAIDA_DESCARTE</option>
                  </Select>
                  <Input type="date" label="Data" value={movementForm.movement_date} onChange={(e) => setMovementForm({ ...movementForm, movement_date: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" label="Hora" value={movementForm.movement_time} onChange={(e) => setMovementForm({ ...movementForm, movement_time: e.target.value })} />
                  <Select
                    label="Turno"
                    value={movementForm.shift}
                    onChange={(e) => setMovementForm({ ...movementForm, shift: e.target.value, is_overtime: true })}
                  >
                    <option value="PRIMEIRO TURNO">PRIMEIRO TURNO</option>
                    <option value="SEGUNDO TURNO">SEGUNDO TURNO</option>
                    <option value="TERCEIRO TURNO">TERCEIRO TURNO</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input
                    checked={movementForm.is_overtime}
                    type="checkbox"
                    onChange={(e) =>
                      setMovementForm({
                        ...movementForm,
                        is_overtime: e.target.checked,
                        shift: e.target.checked ? movementForm.shift : inferShiftFromTime(movementForm.movement_time),
                      })
                    }
                  />
                  Hora extra
                </label>
                {movementForm.type === 'ENTRADA' ? (
                  <>
                    <Input
                      label="Pesquisar compra"
                      placeholder="Digite Nº Item, nome ou nota"
                      value={movementPurchaseSearch}
                      onChange={(e) => setMovementPurchaseSearch(e.target.value)}
                    />
                    <Select required label="Compra" value={movementForm.lot_id} onChange={(e) => setMovementForm({ ...movementForm, lot_id: e.target.value, product_id: '' })}>
                      <option value="">Selecione</option>
                      {filteredMovementLots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {`${lot.product_code} - ${lot.product_name} | Nota ${lot.code} | Prev. ${lot.purchase_quantity} | Receber ${lot.remaining_quantity}`}
                        </option>
                      ))}
                    </Select>
                  </>
                ) : (
                  <SearchableProductSelect
                    label="Produto"
                    searchValue={movementProductSearch}
                    onSearchChange={setMovementProductSearch}
                    value={movementForm.product_id}
                    onChange={(e) => setMovementForm({ ...movementForm, product_id: e.target.value, lot_id: '' })}
                    options={filteredMovementProducts}
                  />
                )}
                {selectedMovementPurchase ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-bold text-slate-900">Dados da compra selecionada</p>
                    <p className="mt-2">Produto: {selectedMovementPurchase.product_code} - {selectedMovementPurchase.product_name}</p>
                    <p>Nota: {selectedMovementPurchase.code}</p>
                    <p>Quantidade comprada: {selectedMovementPurchase.purchase_quantity}</p>
                    <p>Quantidade ja recebida: {selectedMovementPurchase.received_quantity}</p>
                    <p>Quantidade sugerida para receber: {selectedMovementPurchase.remaining_quantity}</p>
                    <p>Validade informada: {selectedMovementPurchase.expiry_date || 'Preencher no recebimento'}</p>
                  </div>
                ) : null}
                {movementForm.type !== 'ENTRADA' && selectedMovementProduct ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-bold text-slate-900">Produto selecionado para saida</p>
                    <p className="mt-2">{selectedMovementProduct.code} - {selectedMovementProduct.name}</p>
                    <p>O sistema vai usar automaticamente a compra com saldo disponivel mais adequada.</p>
                  </div>
                ) : null}
                {movementForm.type === 'ENTRADA' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      required
                      type="date"
                      label="Fabricacao"
                      value={movementForm.manufacture_date}
                      onChange={(e) => setMovementForm({ ...movementForm, manufacture_date: e.target.value })}
                    />
                    <Input
                      required
                      type="date"
                      label="Validade"
                      value={movementForm.expiry_date}
                      onChange={(e) => setMovementForm({ ...movementForm, expiry_date: e.target.value })}
                    />
                  </div>
                ) : null}
                <Input required type="number" step="0.01" label="Quantidade" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
                <Input
                  label="Responsavel"
                  extraSuggestions={
                    movementForm.type === 'ENTRADA'
                      ? allActivePeople.map((person) => person.name)
                      : almoxarifePeople.map((person) => person.name)
                  }
                  value={
                    movementForm.type === 'ENTRADA'
                      ? movementForm.responsible
                      : movementForm.responsible
                  }
                  onChange={(e) => setMovementForm({ ...movementForm, responsible: e.target.value })}
                  readOnly={movementForm.type !== 'ENTRADA'}
                />
                <Input
                  label="Destino/Motivo"
                  extraSuggestions={
                    movementForm.type === 'ENTRADA'
                      ? entradaReasons.map((reason) => reason.name)
                      : saidaReasons.map((reason) => reason.name)
                  }
                  value={movementForm.destination_reason}
                  onChange={(e) => setMovementForm({ ...movementForm, destination_reason: e.target.value })}
                />
                <Input label="Observacoes" value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} />
                <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar movimentacao</button>
              </form>
            </Section>

            <Section title="Historico recente">
              <div className="max-h-[540px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="p-2">Data</th>
                      <th className="p-2">Hora</th>
                      <th className="p-2">Turno</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Produto</th>
                      <th className="p-2">Nota compra</th>
                      <th className="p-2">Qtd.</th>
                      <th className="p-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id} className="border-b hover:bg-slate-50">
                        <td className="p-2">{movement.movement_date}</td>
                        <td className="p-2">{movement.movement_time || '-'}</td>
                        <td className="p-2">{movement.shift ? `${movement.shift}${movement.is_overtime ? ' + HE' : ''}` : '-'}</td>
                        <td className="p-2 font-semibold">{movement.type}</td>
                        <td className="p-2">{movement.product_code} - {movement.product_name}</td>
                        <td className="p-2">{movement.lot_code}</td>
                        <td className="p-2">{movement.quantity}</td>
                        <td className="p-2">{movement.destination_reason || '-'}</td>
                      </tr>
                    ))}
                    {!movements.length ? (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={8}>
                          Nenhuma movimentacao registrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'estoque' && (
          <Section
            title="Estoque por compra e alertas"
            subtitle="Use a busca para localizar rapidamente por Nº Item ou nota de compra."
            actions={
              <div className="flex flex-col gap-3 md:min-w-[320px]">
                <Input label="Pesquisar por Nº Item" placeholder="Nº Item ou nota" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
                <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white" onClick={printStockReport} type="button">
                  Imprimir estoque
                </button>
              </div>
            }
          >
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-100 text-left">
                    <th className="p-2">Produto</th>
                    <th className="p-2">Nota compra</th>
                    <th className="p-2">Validade</th>
                    <th className="p-2">Dias</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Minimo</th>
                    <th className="p-2">Alerta estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((item) => (
                    <tr key={item.lot_id} className="border-b hover:bg-slate-50">
                      <td className="p-2">{item.product_code} - {item.product_name}</td>
                      <td className="p-2">{item.lot_code}</td>
                      <td className="p-2">{item.expiry_date || '-'}</td>
                      <td className="p-2">{item.days_to_expiry ?? '-'}</td>
                      <td className="p-2"><Badge status={item.expiry_status}>{item.expiry_status}</Badge></td>
                      <td className="p-2 font-bold">{item.current_stock} {item.unit}</td>
                      <td className="p-2">{item.minimum_stock}</td>
                      <td className="p-2">{item.below_minimum ? <span className="font-bold text-orange-700">ABAIXO DO MINIMO</span> : 'OK'}</td>
                    </tr>
                  ))}
                  {!filteredStock.length ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={8}>
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === 'tanque' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.5fr]">
            <Section title="Analise do tanque" subtitle="Escolha entre viscosidade e teor de solidos.">
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                {[
                  ['viscosidade', 'Viscosidade'],
                  ['solidos', 'Teor de solidos'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTankMainTab(id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      tankMainTab === id ? 'bg-brand-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tankMainTab === 'viscosidade' ? (
                <form className="grid gap-3" onSubmit={submitTankAnalysis}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input required type="date" label="Data" value={tankForm.analysis_date} onChange={(e) => setTankForm({ ...tankForm, analysis_date: e.target.value })} />
                    <Input required type="time" label="Hora" value={tankForm.analysis_time} onChange={(e) => setTankForm({ ...tankForm, analysis_time: e.target.value })} />
                  </div>
                  <Input required label="Viscosidade" placeholder="Digite so os numeros: 4832 ou 10215" value={tankForm.viscosity_input} onChange={(e) => setTankForm({ ...tankForm, viscosity_input: normalizeViscosityMask(e.target.value.replace(/[^\d]/g, '')) })} />
                  <p className="text-xs text-slate-500">Exemplos: `4832` vira `48.32` e `10215` vira `1:02.15`.</p>
                  {tankViscosityStatus ? (
                    <div className={`rounded-2xl border p-3 text-sm font-bold ${tankViscosityStatus === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                      {tankViscosityStatus === 'OK' ? `Viscosidade dentro da faixa ideal (${formatViscosity(tankViscositySeconds)})` : `Viscosidade fora da faixa ideal (${formatViscosity(tankViscositySeconds)})`}
                    </div>
                  ) : null}
                  {shouldShowCorrectedViscosity ? (
                    <div className="space-y-3">
                      <Input required label="Viscosidade apos a correcao" placeholder="Digite so os numeros: 5000 ou 10215" value={tankForm.corrected_viscosity_input} onChange={(e) => setTankForm({ ...tankForm, corrected_viscosity_input: normalizeViscosityMask(e.target.value.replace(/[^\d]/g, '')) })} />
                      {correctedTankViscosityStatus ? (
                        <div className={`rounded-2xl border p-3 text-sm font-bold ${correctedTankViscosityStatus === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                          {correctedTankViscosityStatus === 'OK' ? `Leitura corrigida com sucesso (${formatViscosity(correctedTankViscositySeconds)})` : `Mesmo apos a correcao, a viscosidade segue fora da faixa (${formatViscosity(correctedTankViscositySeconds)})`}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input type="number" step="0.01" label="Adicao de solvente" value={tankForm.solvent_amount} onChange={(e) => setTankForm({ ...tankForm, solvent_amount: e.target.value })} />
                    <Input type="number" step="0.01" label="Adicao de tinta" value={tankForm.paint_amount} onChange={(e) => setTankForm({ ...tankForm, paint_amount: e.target.value })} />
                  </div>
                  <Input label="Responsavel" extraSuggestions={almoxarifePeople.map((person) => person.name)} value={tankForm.responsible} onChange={(e) => setTankForm({ ...tankForm, responsible: e.target.value })} />
                  <Input label="Observacoes" value={tankForm.notes} onChange={(e) => setTankForm({ ...tankForm, notes: e.target.value })} />
                  <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar analise</button>
                </form>
              ) : (
                <form className="grid gap-4" onSubmit={submitSolidContentAnalysis}>
                  <div className="grid grid-cols-2 gap-3">
                    <Input required type="date" label="Data" value={solidForm.analysis_date} onChange={(e) => setSolidForm({ ...solidForm, analysis_date: e.target.value })} />
                    <Input required type="time" label="Hora" value={solidForm.analysis_time} onChange={(e) => setSolidForm({ ...solidForm, analysis_time: e.target.value })} />
                  </div>
                  {[1, 2, 3].map((capsule) => (
                    <div key={capsule} className="rounded-2xl border border-slate-200 p-4">
                      <p className="mb-3 font-bold text-slate-800">Capsula {capsule}</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          required
                          label="Capsula vazia (g)"
                          placeholder="Ex.: 0,21"
                          value={solidForm[`capsule${capsule}_empty_weight`]}
                          onChange={(e) => setSolidForm({ ...solidForm, [`capsule${capsule}_empty_weight`]: normalizeGramMask(e.target.value) })}
                        />
                        <Input
                          required
                          label="Peso da tinta (g)"
                          placeholder="Ex.: 1,00"
                          value={solidForm[`capsule${capsule}_wet_weight`]}
                          onChange={(e) => setSolidForm({ ...solidForm, [`capsule${capsule}_wet_weight`]: normalizeGramMask(e.target.value) })}
                        />
                        <Input
                          required
                          label="Peso apos seco (g)"
                          placeholder="Ex.: 0,52"
                          value={solidForm[`capsule${capsule}_dry_weight`]}
                          onChange={(e) => setSolidForm({ ...solidForm, [`capsule${capsule}_dry_weight`]: normalizeGramMask(e.target.value) })}
                        />
                      </div>
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                        <span className="font-bold text-slate-700">Percentual da capsula {capsule}: </span>
                        <span className={solidCapsuleResults[capsule - 1] == null ? 'text-slate-500' : solidCapsuleResults[capsule - 1] >= 30 && solidCapsuleResults[capsule - 1] <= 32 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
                          {solidCapsuleResults[capsule - 1] == null ? 'Preencha os 3 pesos' : `${solidCapsuleResults[capsule - 1]}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-700">Media do teor de solidos</p>
                    <p className={`mt-2 text-2xl font-black ${solidAverageResult == null ? 'text-slate-400' : solidAverageResult >= 30 && solidAverageResult <= 32 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {solidAverageResult == null ? '--' : `${solidAverageResult}%`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Faixa ideal: 30% a 32%</p>
                  </div>
                  <Input label="Responsavel" extraSuggestions={almoxarifePeople.map((person) => person.name)} value={solidForm.responsible} onChange={(e) => setSolidForm({ ...solidForm, responsible: e.target.value })} />
                  <Input label="Observacoes" value={solidForm.notes} onChange={(e) => setSolidForm({ ...solidForm, notes: e.target.value })} />
                  <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar teor de solidos</button>
                </form>
              )}
            </Section>

            {tankMainTab === 'viscosidade' ? (
              <Section title="Analise visual" subtitle="Use as subtabs para alternar entre viscosidade, adicoes e historico.">
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  {[
                    ['viscosidade', 'Viscosidade'],
                    ['adicoes', 'Adicoes'],
                    ['historico', 'Historico'],
                  ].map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setTankViewTab(id)} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${tankViewTab === id ? 'bg-brand-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {tankViewTab === 'viscosidade' ? (
                  <div className="space-y-4">
                    <TankChart data={tankAnalyses.slice(0, 20)} />
                    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-green-600" />Leitura na faixa</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-red-600" />Leitura fora da faixa</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />Adicao de solvente</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-0 w-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-orange-600" />Adicao de tinta</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-violet-700" />Viscosidade apos correcao ainda fora</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-green-600" />Viscosidade apos correcao ajustada</span>
                    </div>
                  </div>
                ) : null}
                {tankViewTab === 'adicoes' ? (
                  <div className="space-y-3">
                    <AdditionsLinesChart data={tankAnalyses.slice(0, 20)} />
                    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-blue-600" />Linha de solvente</span>
                      <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-orange-600" />Linha de tinta</span>
                    </div>
                  </div>
                ) : null}
                {tankViewTab === 'historico' ? (
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-100 text-left">
                          <th className="p-2">Data</th>
                          <th className="p-2">Hora</th>
                          <th className="p-2">Visc. inicial</th>
                          <th className="p-2">Visc. apos correcao</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Solvente</th>
                          <th className="p-2">Tinta</th>
                          <th className="p-2">Responsavel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tankAnalyses.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-slate-50">
                            <td className="p-2">{item.analysis_date}</td>
                            <td className="p-2">{item.analysis_time || '-'}</td>
                            <td className="p-2 font-semibold">{formatViscosity(item.viscosity_seconds)}</td>
                            <td className="p-2">{item.corrected_viscosity_seconds ? formatViscosity(item.corrected_viscosity_seconds) : '-'}</td>
                            <td className="p-2">
                              {item.in_target_range ? <span className="font-bold text-emerald-700">OK</span> : item.corrected_viscosity_seconds && item.corrected_viscosity_seconds >= 48 && item.corrected_viscosity_seconds <= 52 ? <span className="font-bold text-blue-700">FORA, MAS CORRIGIDO</span> : <span className="font-bold text-red-700">FORA</span>}
                            </td>
                            <td className="p-2">{item.solvent_amount ?? '-'}</td>
                            <td className="p-2">{item.paint_amount ?? '-'}</td>
                            <td className="p-2">{item.responsible || '-'}</td>
                          </tr>
                        ))}
                        {!tankAnalyses.length ? (
                          <tr><td className="p-3 text-slate-500" colSpan={8}>Nenhuma analise registrada.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Section>
            ) : (
              <Section title="Historico teor de solidos" subtitle="Percentual medio ideal entre 30% e 32%.">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-100 text-left">
                        <th className="p-2">Data</th>
                        <th className="p-2">Hora</th>
                        <th className="p-2">Caps. 1</th>
                        <th className="p-2">Caps. 2</th>
                        <th className="p-2">Caps. 3</th>
                        <th className="p-2">Media</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Responsavel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solidContentAnalyses.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-slate-50">
                          <td className="p-2">{item.analysis_date}</td>
                          <td className="p-2">{item.analysis_time || '-'}</td>
                          <td className="p-2">{item.capsule1_percentage}%</td>
                          <td className="p-2">{item.capsule2_percentage}%</td>
                          <td className="p-2">{item.capsule3_percentage}%</td>
                          <td className="p-2 font-bold">{item.average_percentage}%</td>
                          <td className="p-2">
                            {item.in_target_range ? <span className="font-bold text-emerald-700">OK</span> : <span className="font-bold text-red-700">FORA</span>}
                          </td>
                          <td className="p-2">{item.responsible || '-'}</td>
                        </tr>
                      ))}
                      {!solidContentAnalyses.length ? (
                        <tr><td className="p-3 text-slate-500" colSpan={8}>Nenhuma analise de teor de solidos registrada.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        )}

        {activeTab === 'controle' && isTechnical && (
          <div className="grid gap-6">
            <Section
              title="Painel de controle"
              subtitle="Separei a administracao por assunto para deixar essa area mais limpa e rapida."
            >
              <div className="grid gap-2 md:grid-cols-4">
                {[
                  ['cadastros', 'Cadastros'],
                  ['motivos', 'Motivos'],
                  ['acessos', 'Acessos'],
                  ['alertas', 'Alertas'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setControlTab(id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      controlTab === id
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            {controlTab === 'cadastros' ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section
              title={editingPersonId ? 'Editar cadastro' : 'Novo cadastro'}
              subtitle="Cadastre responsaveis e almoxarifes para reutilizar nos lancamentos."
            >
              <form className="grid gap-3" onSubmit={submitPerson}>
                <Input
                  required
                  label="Nome"
                  value={personForm.name}
                  onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
                />
                <Select
                  label="Tipo"
                  value={personForm.type}
                  onChange={(e) => setPersonForm({ ...personForm, type: e.target.value })}
                >
                  <option value="RESPONSAVEL">Responsavel</option>
                  <option value="ALMOXARIFE">Almoxarife</option>
                </Select>
                <Input
                  label="Observacoes"
                  value={personForm.notes}
                  onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })}
                />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input
                    checked={personForm.active}
                    type="checkbox"
                    onChange={(e) => setPersonForm({ ...personForm, active: e.target.checked })}
                  />
                  Cadastro ativo
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                    {editingPersonId ? 'Salvar alteracoes' : 'Salvar cadastro'}
                  </button>
                  {editingPersonId ? (
                    <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-700" onClick={cancelEditPerson} type="button">
                      Cancelar edicao
                    </button>
                  ) : null}
                </div>
              </form>
            </Section>

            <Section title="Cadastros de apoio" subtitle="Esses nomes aparecem como sugestao e preenchimento nos lancamentos.">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Almoxarifes</h3>
                  <div className="mt-3 overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-100 text-left">
                          <th className="p-2">Nome</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Observacoes</th>
                          <th className="p-2">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.filter((person) => person.type === 'ALMOXARIFE').map((person) => (
                          <tr key={person.id} className="border-b hover:bg-slate-50">
                            <td className="p-2 font-semibold">{person.name}</td>
                            <td className="p-2">{person.active ? 'Ativo' : 'Inativo'}</td>
                            <td className="p-2">{person.notes || '-'}</td>
                            <td className="p-2">
                              <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditPerson(person)} type="button">
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Responsaveis</h3>
                  <div className="mt-3 overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-100 text-left">
                          <th className="p-2">Nome</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Observacoes</th>
                          <th className="p-2">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.filter((person) => person.type === 'RESPONSAVEL').map((person) => (
                          <tr key={person.id} className="border-b hover:bg-slate-50">
                            <td className="p-2 font-semibold">{person.name}</td>
                            <td className="p-2">{person.active ? 'Ativo' : 'Inativo'}</td>
                            <td className="p-2">{person.notes || '-'}</td>
                            <td className="p-2">
                              <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditPerson(person)} type="button">
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Section>
            </div>
            ) : null}

            {controlTab === 'motivos' ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
              <Section
                title={editingReasonId ? 'Editar motivo' : 'Novo motivo'}
                subtitle="Cadastre motivos padrao para entrada e saida."
              >
                <form className="grid gap-3" onSubmit={submitReason}>
                  <Input
                    required
                    label="Motivo"
                    value={reasonForm.name}
                    onChange={(e) => setReasonForm({ ...reasonForm, name: e.target.value })}
                  />
                  <Select
                    label="Tipo"
                    value={reasonForm.type}
                    onChange={(e) => setReasonForm({ ...reasonForm, type: e.target.value })}
                  >
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saida</option>
                  </Select>
                  <Input
                    label="Observacoes"
                    value={reasonForm.notes}
                    onChange={(e) => setReasonForm({ ...reasonForm, notes: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      checked={reasonForm.active}
                      type="checkbox"
                      onChange={(e) => setReasonForm({ ...reasonForm, active: e.target.checked })}
                    />
                    Motivo ativo
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                      {editingReasonId ? 'Salvar alteracoes' : 'Salvar motivo'}
                    </button>
                    {editingReasonId ? (
                      <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-700" onClick={cancelEditReason} type="button">
                        Cancelar edicao
                      </button>
                    ) : null}
                  </div>
                </form>
              </Section>

              <Section title="Motivos cadastrados" subtitle="Esses motivos aparecem como sugestao direta nas movimentacoes.">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Entrada</h3>
                    <div className="mt-3 overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-100 text-left">
                            <th className="p-2">Motivo</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Observacoes</th>
                            <th className="p-2">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reasons.filter((reason) => reason.type === 'ENTRADA').map((reason) => (
                            <tr key={reason.id} className="border-b hover:bg-slate-50">
                              <td className="p-2 font-semibold">{reason.name}</td>
                              <td className="p-2">{reason.active ? 'Ativo' : 'Inativo'}</td>
                              <td className="p-2">{reason.notes || '-'}</td>
                              <td className="p-2">
                                <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditReason(reason)} type="button">
                                  Editar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Saida</h3>
                    <div className="mt-3 overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-100 text-left">
                            <th className="p-2">Motivo</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Observacoes</th>
                            <th className="p-2">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reasons.filter((reason) => reason.type === 'SAIDA').map((reason) => (
                            <tr key={reason.id} className="border-b hover:bg-slate-50">
                              <td className="p-2 font-semibold">{reason.name}</td>
                              <td className="p-2">{reason.active ? 'Ativo' : 'Inativo'}</td>
                              <td className="p-2">{reason.notes || '-'}</td>
                              <td className="p-2">
                                <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditReason(reason)} type="button">
                                  Editar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
            ) : null}

            {controlTab === 'acessos' ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
              <Section
                title={editingUserId ? 'Editar acesso' : 'Novo acesso'}
                subtitle="Controle os usuarios que entram no sistema."
              >
                <form className="grid gap-3" onSubmit={submitUser}>
                  <Input
                    required
                    label="Usuario"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  />
                  <Input
                    required
                    label="Nome completo"
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  />
                  <Input
                    label={editingUserId ? 'Nova senha (opcional)' : 'Senha'}
                    required={!editingUserId}
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                  <Select
                    label="Perfil"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="ALMOXARIFE">Almoxarife</option>
                    <option value="AREA_TECNICA">Area tecnica</option>
                  </Select>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      checked={userForm.active}
                      type="checkbox"
                      onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                    />
                    Usuario ativo
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                      {editingUserId ? 'Salvar alteracoes' : 'Salvar acesso'}
                    </button>
                    {editingUserId ? (
                      <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-700" onClick={cancelEditUser} type="button">
                        Cancelar edicao
                      </button>
                    ) : null}
                  </div>
                </form>
              </Section>

              <Section title="Acessos cadastrados" subtitle="Perfis e ativacao de usuarios do sistema.">
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-100 text-left">
                        <th className="p-2">Usuario</th>
                        <th className="p-2">Nome</th>
                        <th className="p-2">Perfil</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 font-semibold">{user.username}</td>
                          <td className="p-2">{user.full_name}</td>
                          <td className="p-2">{user.role === 'AREA_TECNICA' ? 'Area tecnica' : 'Almoxarife'}</td>
                          <td className="p-2">{user.active ? 'Ativo' : 'Inativo'}</td>
                          <td className="p-2">
                            <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditUser(user)} type="button">
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
            ) : null}

            {controlTab === 'alertas' ? (
            <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
              <Section
                title="Alertas com Outlook"
                subtitle="O sistema monta o assunto e o corpo automaticamente e abre o e-mail pronto no Outlook padrão da máquina."
              >
                <form className="grid gap-3" onSubmit={submitEmailSettings}>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      checked={emailSettings.enabled}
                      type="checkbox"
                      onChange={(e) => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                    />
                    Habilitar envio de e-mails
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      checked={emailSettings.viscosity_alert_enabled}
                      type="checkbox"
                      onChange={(e) => setEmailSettings({ ...emailSettings, viscosity_alert_enabled: e.target.checked })}
                    />
                    Alertar viscosidade fora da faixa
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input
                      checked={emailSettings.expiry_alert_enabled}
                      type="checkbox"
                      onChange={(e) => setEmailSettings({ ...emailSettings, expiry_alert_enabled: e.target.checked })}
                    />
                    Alertar validade ao abrir o programa
                  </label>
                  <Input
                    label="Dias para alerta de validade"
                    min="1"
                    type="number"
                    value={emailSettings.expiry_days}
                    onChange={(e) => setEmailSettings({ ...emailSettings, expiry_days: e.target.value })}
                  />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-bold text-slate-800">Como funciona agora</p>
                    <p className="mt-2">Quando a viscosidade sair da faixa, o sistema abre um novo e-mail no Outlook com assunto e corpo preenchidos automaticamente.</p>
                    <p className="mt-2">Quando houver tinta perto do vencimento, o sistema prepara um e-mail de validade. Voce pode abrir esse rascunho abaixo.</p>
                  </div>
                  <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                    Salvar configuracao
                  </button>
                </form>
              </Section>

              <Section
                title={editingRecipientId ? 'Editar destinatario' : 'Novo destinatario'}
                subtitle="Esses e-mails recebem os alertas automáticos."
              >
                <div className="grid gap-6 lg:grid-cols-[0.95fr,1.35fr]">
                  <form className="grid gap-3" onSubmit={submitRecipient}>
                    <Input
                      label="Nome"
                      value={recipientForm.name}
                      onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })}
                    />
                    <Input
                      required
                      label="E-mail"
                      type="email"
                      value={recipientForm.email}
                      onChange={(e) => setRecipientForm({ ...recipientForm, email: e.target.value })}
                    />
                    <Input
                      label="Observacoes"
                      value={recipientForm.notes}
                      onChange={(e) => setRecipientForm({ ...recipientForm, notes: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <input
                        checked={recipientForm.active}
                        type="checkbox"
                        onChange={(e) => setRecipientForm({ ...recipientForm, active: e.target.checked })}
                      />
                      Destinatario ativo
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">
                        {editingRecipientId ? 'Salvar alteracoes' : 'Salvar destinatario'}
                      </button>
                      {editingRecipientId ? (
                        <button className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-700" onClick={cancelEditRecipient} type="button">
                          Cancelar edicao
                        </button>
                      ) : null}
                    </div>
                  </form>

                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-100 text-left">
                          <th className="p-2">Nome</th>
                          <th className="p-2">E-mail</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailRecipients.map((recipient) => (
                          <tr key={recipient.id} className="border-b hover:bg-slate-50">
                            <td className="p-2 font-semibold">{recipient.name || '-'}</td>
                            <td className="p-2">{recipient.email}</td>
                            <td className="p-2">{recipient.active ? 'Ativo' : 'Inativo'}</td>
                            <td className="p-2">
                              <button className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white" onClick={() => startEditRecipient(recipient)} type="button">
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!emailRecipients.length ? (
                          <tr>
                            <td className="p-3 text-slate-500" colSpan={4}>Nenhum destinatario cadastrado.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Section>
            </div>
            ) : null}

            {controlTab === 'alertas' ? (
              <Section
                title="E-mail de validade pronto"
                subtitle="Quando houver item com saldo e validade dentro do limite configurado, voce pode abrir o e-mail pronto no Outlook."
              >
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-bold text-slate-800">Dados preenchidos automaticamente</p>
                    <p className="mt-2">Nº item, nome do produto, nota, validade, status da validade e saldo atual.</p>
                    <p className="mt-2">Os destinatarios usados sao os cadastrados logo acima nesta mesma aba.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white disabled:opacity-50"
                      type="button"
                      disabled={!expiryEmailDraft}
                      onClick={async () => {
                        if (!expiryEmailDraft) return
                        openMailDraft(expiryEmailDraft)
                        await safeApi('/email-drafts/expiry/mark-opened', { method: 'POST' }).catch(() => null)
                        setExpiryEmailDraft(null)
                      }}
                    >
                      Abrir e-mail de validade no Outlook
                    </button>
                    {!expiryEmailDraft ? (
                      <span className="self-center text-sm text-slate-500">Nenhum alerta de validade pendente no momento.</span>
                    ) : null}
                  </div>
                </div>
              </Section>
            ) : null}
          </div>
        )}

        <footer className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-600 shadow-panel">
          <span>{loading ? 'Atualizando dados...' : 'Dados sincronizados com o servidor local'}</span>
          <span className="mx-2 text-slate-300">|</span>
          <span>Desenvolvido por </span>
          <a
            className="font-semibold text-slate-800 underline underline-offset-2 hover:text-slate-950"
            href="https://keventech.com.br"
            target="_blank"
            rel="noreferrer"
          >
            Keven Tech
          </a>
        </footer>
      </div>
    </div>
  )
}
