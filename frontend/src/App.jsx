import { useEffect, useMemo, useState } from 'react'

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const tabs = [
  { id: 'painel', label: 'Painel' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'lotes', label: 'Lotes' },
  { id: 'movimentacoes', label: 'Movimentacoes' },
  { id: 'estoque', label: 'Estoque/Validades' },
]

const todayISO = new Date().toISOString().slice(0, 10)

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'Erro ao comunicar com o servidor')
  }
  return res.json()
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
          : 'bg-emerald-100 text-emerald-700'

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${css}`}>{children}</span>
}

function Input({ label, ...props }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-brand-500 transition focus:border-brand-500 focus:ring"
      />
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

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('painel')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    category: 'TINTA',
    unit: 'L',
    minimum_stock: 0,
    storage_location: '',
    notes: '',
  })

  const [lotForm, setLotForm] = useState({
    product_id: '',
    code: '',
    manufacture_date: '',
    expiry_date: '',
    supplier: '',
    notes: '',
  })

  const [movementForm, setMovementForm] = useState({
    lot_id: '',
    type: 'ENTRADA',
    movement_date: todayISO,
    quantity: '',
    responsible: '',
    destination_reason: '',
    notes: '',
  })

  const lotOptions = useMemo(
    () =>
      lots.map((l) => ({
        id: l.id,
        label: `${l.product_code} - ${l.product_name} | Lote ${l.code} | Val ${l.expiry_date}`,
      })),
    [lots],
  )

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [d, p, l, m, s] = await Promise.all([
        api('/dashboard'),
        api('/products'),
        api('/lots'),
        api('/movements'),
        api('/stock'),
      ])
      setDashboard(d)
      setProducts(p)
      setLots(l)
      setMovements(m)
      setStock(s)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function submitProduct(e) {
    e.preventDefault()
    try {
      await api('/products', { method: 'POST', body: JSON.stringify({ ...productForm, minimum_stock: Number(productForm.minimum_stock || 0) }) })
      setProductForm({
        code: '',
        name: '',
        category: 'TINTA',
        unit: 'L',
        minimum_stock: 0,
        storage_location: '',
        notes: '',
      })
      await loadAll()
      setActiveTab('produtos')
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitLot(e) {
    e.preventDefault()
    try {
      await api('/lots', {
        method: 'POST',
        body: JSON.stringify({
          ...lotForm,
          product_id: Number(lotForm.product_id),
          manufacture_date: lotForm.manufacture_date || null,
          expiry_date: lotForm.expiry_date,
        }),
      })
      setLotForm({
        product_id: '',
        code: '',
        manufacture_date: '',
        expiry_date: '',
        supplier: '',
        notes: '',
      })
      await loadAll()
      setActiveTab('lotes')
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitMovement(e) {
    e.preventDefault()
    try {
      await api('/movements', {
        method: 'POST',
        body: JSON.stringify({
          ...movementForm,
          lot_id: Number(movementForm.lot_id),
          quantity: Number(movementForm.quantity),
        }),
      })
      setMovementForm({
        lot_id: '',
        type: 'ENTRADA',
        movement_date: todayISO,
        quantity: '',
        responsible: '',
        destination_reason: '',
        notes: '',
      })
      await loadAll()
      setActiveTab('movimentacoes')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8fff4,_#f8fafc_45%,_#eef2ff)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Deposito</p>
          <h1 className="mt-2 text-2xl font-black md:text-4xl">Controle de Tintas e Inflamaveis</h1>
          <p className="mt-2 text-sm text-slate-200">Operacao offline para rede local, sem login.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-panel md:grid-cols-5">
          {tabs.map((tab) => (
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
              <Card title="Lotes" value={dashboard.total_lots} />
              <Card title="Unidades em Estoque" value={dashboard.total_units} tone="ok" />
              <Card title="Abaixo do Minimo" value={dashboard.below_minimum} tone="warn" />
              <Card title="Vencidos" value={dashboard.expired} tone="danger" />
              <Card title="Vence <= 30 dias" value={dashboard.expiring_30} tone="warn" />
              <Card title="Atencao 31-60" value={dashboard.expiring_60} tone="warn" />
            </div>
            <Section title="Acoes rapidas" subtitle="Use as abas para cadastrar e movimentar.">
              <div className="grid gap-3 md:grid-cols-3">
                <button className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('produtos')}>Cadastrar produto</button>
                <button className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('lotes')}>Cadastrar lote</button>
                <button className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white" onClick={() => setActiveTab('movimentacoes')}>Lancar movimentacao</button>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'produtos' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section title="Novo produto" subtitle="Cadastre uma vez e use em todos os lotes.">
              <form className="grid gap-3" onSubmit={submitProduct}>
                <Input required label="Codigo" value={productForm.code} onChange={(e) => setProductForm({ ...productForm, code: e.target.value })} />
                <Input required label="Nome" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
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
                <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar produto</button>
              </form>
            </Section>

            <Section title="Produtos cadastrados">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="p-2">Codigo</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Categoria</th>
                      <th className="p-2">Unid.</th>
                      <th className="p-2">Minimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-slate-50">
                        <td className="p-2 font-semibold">{p.code}</td>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2">{p.category}</td>
                        <td className="p-2">{p.unit}</td>
                        <td className="p-2">{p.minimum_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'lotes' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section title="Novo lote" subtitle="Cada lote deve ter validade e produto vinculado.">
              <form className="grid gap-3" onSubmit={submitLot}>
                <Select required label="Produto" value={lotForm.product_id} onChange={(e) => setLotForm({ ...lotForm, product_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </Select>
                <Input required label="Codigo do lote" value={lotForm.code} onChange={(e) => setLotForm({ ...lotForm, code: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" label="Fabricacao" value={lotForm.manufacture_date} onChange={(e) => setLotForm({ ...lotForm, manufacture_date: e.target.value })} />
                  <Input required type="date" label="Validade" value={lotForm.expiry_date} onChange={(e) => setLotForm({ ...lotForm, expiry_date: e.target.value })} />
                </div>
                <Input label="Fornecedor" value={lotForm.supplier} onChange={(e) => setLotForm({ ...lotForm, supplier: e.target.value })} />
                <Input label="Observacoes" value={lotForm.notes} onChange={(e) => setLotForm({ ...lotForm, notes: e.target.value })} />
                <button className="rounded-xl bg-brand-500 px-4 py-2 font-bold text-white" type="submit">Salvar lote</button>
              </form>
            </Section>

            <Section title="Lotes cadastrados">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="p-2">Produto</th>
                      <th className="p-2">Lote</th>
                      <th className="p-2">Validade</th>
                      <th className="p-2">Fornecedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l) => (
                      <tr key={l.id} className="border-b hover:bg-slate-50">
                        <td className="p-2">{l.product_code} - {l.product_name}</td>
                        <td className="p-2 font-semibold">{l.code}</td>
                        <td className="p-2">{l.expiry_date}</td>
                        <td className="p-2">{l.supplier || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'movimentacoes' && (
          <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">
            <Section title="Nova movimentacao" subtitle="Entrada, saida para uso ou descarte.">
              <form className="grid gap-3" onSubmit={submitMovement}>
                <Select required label="Lote" value={movementForm.lot_id} onChange={(e) => setMovementForm({ ...movementForm, lot_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {lotOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Tipo" value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value })}>
                    <option>ENTRADA</option>
                    <option>SAIDA_USO</option>
                    <option>SAIDA_DESCARTE</option>
                  </Select>
                  <Input type="date" label="Data" value={movementForm.movement_date} onChange={(e) => setMovementForm({ ...movementForm, movement_date: e.target.value })} />
                </div>
                <Input required type="number" step="0.01" label="Quantidade" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
                <Input label="Responsavel" value={movementForm.responsible} onChange={(e) => setMovementForm({ ...movementForm, responsible: e.target.value })} />
                <Input label="Destino/Motivo" value={movementForm.destination_reason} onChange={(e) => setMovementForm({ ...movementForm, destination_reason: e.target.value })} />
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
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Produto</th>
                      <th className="p-2">Lote</th>
                      <th className="p-2">Qtd.</th>
                      <th className="p-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-slate-50">
                        <td className="p-2">{m.movement_date}</td>
                        <td className="p-2 font-semibold">{m.type}</td>
                        <td className="p-2">{m.product_name}</td>
                        <td className="p-2">{m.lot_code}</td>
                        <td className="p-2">{m.quantity}</td>
                        <td className="p-2">{m.destination_reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'estoque' && (
          <Section title="Estoque por lote e alertas" subtitle="As cores ajudam a priorizar vencidos e itens criticos.">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-100 text-left">
                    <th className="p-2">Produto</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2">Validade</th>
                    <th className="p-2">Dias</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Minimo</th>
                    <th className="p-2">Alerta estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.lot_id} className="border-b hover:bg-slate-50">
                      <td className="p-2">{s.product_code} - {s.product_name}</td>
                      <td className="p-2">{s.lot_code}</td>
                      <td className="p-2">{s.expiry_date}</td>
                      <td className="p-2">{s.days_to_expiry}</td>
                      <td className="p-2"><Badge status={s.expiry_status}>{s.expiry_status}</Badge></td>
                      <td className="p-2 font-bold">{s.current_stock} {s.unit}</td>
                      <td className="p-2">{s.minimum_stock}</td>
                      <td className="p-2">{s.below_minimum ? <span className="font-bold text-orange-700">ABAIXO DO MINIMO</span> : 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <footer className="text-center text-xs text-slate-500">
          {loading ? 'Atualizando dados...' : 'Dados sincronizados com o servidor local'}
        </footer>
      </div>
    </div>
  )
}
