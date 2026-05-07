/**
 * eprotesto.ts — Integração com gateway e-Protesto para protesto de títulos.
 *
 * REGRA CRÍTICA: Protesto NUNCA é enviado automaticamente.
 * Todo protesto requer aprovação manual de advogado/admin antes do envio.
 * Esta regra é reforçada tanto na camada de aplicação quanto em triggers de DB.
 *
 * Fluxo:
 *   solicitarProtesto  → insere com status='aguardando_aprovacao'
 *   aprovarProtesto    → advogado aprova → status='solicitado' → chama enviarParaCartorio
 *   enviarParaCartorio → POST e-Protesto API → status='enviado'
 *   cancelarProtesto   → cancela no gateway e no DB
 *   monitorarStatus    → consulta status atual no gateway
 *
 * NOTA DE SEGURANÇA: Em produção, as chamadas à API do e-Protesto devem ser
 * migradas para uma Supabase Edge Function para que as credenciais (API Key)
 * não fiquem expostas no bundle do frontend. Por ora usam VITE_EPROTESTO_*
 * apenas em ambiente de desenvolvimento/staging.
 */

import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/utils'
import { format } from 'date-fns'

// ── Tipos públicos ────────────────────────────────────────────

export interface EnderecoCompleto {
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}

export interface SolicitacaoProtesto {
  caso_id: string
  cobranca_id: string
  valor: number
  tipo_titulo: string
  dados_devedor: {
    nome: string
    cpf_cnpj: string
    endereco: EnderecoCompleto
  }
  dados_credor: {
    nome: string
    cpf_cnpj: string
  }
}

export interface ProtestoResult {
  sucesso: boolean
  protesto_id: string
  status: string
  mensagem?: string
}

export interface CartorioResult {
  sucesso: boolean
  numero_protocolo?: string
  id_gateway?: string
  pdf_url?: string
  erro?: string
}

export interface StatusProtesto {
  status: string
  numero_protocolo?: string
  data_atualizacao?: string
}

// ── Helpers internos ──────────────────────────────────────────

async function obterUsuarioId(): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser()
  if (!me.user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', me.user.id)
    .single()
  return data?.id ?? null
}

async function registrarEventoTimeline(
  caso_id: string,
  tipo_evento: string,
  descricao: string,
  usuario_id?: string | null,
): Promise<void> {
  const uid = usuario_id !== undefined ? usuario_id : await obterUsuarioId()
  await supabase.from('eventos_timeline').insert({
    caso_id,
    tipo_evento,
    descricao,
    usuario_id: uid ?? null,
  })
}

async function registrarAuditoria(
  acao: string,
  entidade: string,
  entidade_id: string,
  dados_antes: Record<string, unknown> | null,
  dados_depois: Record<string, unknown> | null,
  usuario_id?: string | null,
): Promise<void> {
  const uid = usuario_id !== undefined ? usuario_id : await obterUsuarioId()
  await supabase.from('auditoria').insert({
    usuario_id: uid ?? null,
    acao,
    entidade,
    entidade_id,
    dados_antes,
    dados_depois,
    ip_address: null,
  })
}

function isStubMode(): boolean {
  const key = import.meta.env.VITE_EPROTESTO_API_KEY as string | undefined
  return !key || key.trim() === ''
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Solicita um protesto. Sempre insere com status 'aguardando_aprovacao'.
 * Se valor > R$ 5.000, notifica advogado por e-mail para aprovação.
 * O envio ao cartório NUNCA ocorre automaticamente.
 */
export async function solicitarProtesto(
  params: SolicitacaoProtesto,
  usuario_id?: string,
): Promise<ProtestoResult> {
  try {
    const uid = usuario_id ?? await obterUsuarioId()

    // Camada de aplicação: valor > 5000 exige aprovação (reforço do GENERATED ALWAYS do DB)
    const exige_aprovacao = params.valor > 5000

    const { data: protesto, error: errInsert } = await supabase
      .from('protestos')
      .insert({
        caso_id: params.caso_id,
        valor: params.valor,
        tipo_titulo: params.tipo_titulo,
        status: 'aguardando_aprovacao',
        data_solicitacao: new Date().toISOString(),
        criado_por: uid ?? null,
      })
      .select('id')
      .single()

    if (errInsert || !protesto) {
      throw new Error(errInsert?.message ?? 'Erro ao inserir protesto')
    }

    const descricao = exige_aprovacao
      ? `Protesto de ${formatarMoeda(params.valor)} solicitado — aguarda aprovação de advogado (valor acima de R$ 5.000)`
      : `Protesto de ${formatarMoeda(params.valor)} solicitado — aguarda aprovação`

    // Notificar advogado por e-mail quando valor > 5000
    if (exige_aprovacao) {
      const appUrl = import.meta.env.VITE_APP_URL as string | undefined
      const link = `${appUrl ?? ''}/cobranca/casos/${params.caso_id}`
      await supabase.functions.invoke('enviar-email', {
        body: {
          subject: `Protesto ${formatarMoeda(params.valor)} aguarda sua aprovação`,
          template: 'protesto_aguarda_aprovacao',
          vars: {
            caso_id: params.caso_id,
            valor: formatarMoeda(params.valor),
            tipo_titulo: params.tipo_titulo,
            devedor_nome: params.dados_devedor.nome,
            link_aprovacao: link,
          },
        },
      }).catch(e => console.warn('[solicitarProtesto] Edge Function e-mail indisponível:', e))
    }

    await registrarEventoTimeline(
      params.caso_id,
      'PROTESTO_SOLICITADO',
      descricao,
      uid,
    )

    await registrarAuditoria(
      'PROTESTO_SOLICITADO',
      'protestos',
      protesto.id,
      null,
      { status: 'aguardando_aprovacao', valor: params.valor, exige_aprovacao },
      uid,
    )

    return {
      sucesso: true,
      protesto_id: protesto.id,
      status: 'aguardando_aprovacao',
      mensagem: descricao,
    }
  } catch (err) {
    console.error('[solicitarProtesto]', err)
    return {
      sucesso: false,
      protesto_id: '',
      status: 'erro',
      mensagem: err instanceof Error ? err.message : 'Erro desconhecido ao solicitar protesto',
    }
  }
}

/**
 * Aprova um protesto aguardando aprovação.
 * Apenas usuários com role ADVOGADO ou ADMIN podem aprovar.
 * Após aprovação, chama enviarParaCartorio automaticamente.
 */
export async function aprovarProtesto(
  protesto_id: string,
  advogado_id: string,
): Promise<boolean> {
  // Buscar protesto
  const { data: protesto, error: errProtesto } = await supabase
    .from('protestos')
    .select('*')
    .eq('id', protesto_id)
    .single()

  if (errProtesto || !protesto) {
    throw new Error('Protesto não encontrado')
  }

  if (protesto.status !== 'aguardando_aprovacao') {
    throw new Error(`Protesto não está aguardando aprovação (status atual: ${protesto.status})`)
  }

  // Verificar role do usuário — camada de aplicação
  const { data: usuario, error: errUsuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', advogado_id)
    .single()

  if (errUsuario || !usuario) {
    throw new Error('Usuário não encontrado')
  }

  if (usuario.role !== 'ADVOGADO' && usuario.role !== 'ADMIN') {
    throw new Error('Apenas advogados podem aprovar protestos')
  }

  const dados_antes = {
    status: protesto.status,
    aprovado_por: protesto.aprovado_por,
    aprovado_em: protesto.aprovado_em,
  }

  const agora = new Date().toISOString()

  const { error: errUpdate } = await supabase
    .from('protestos')
    .update({
      status: 'solicitado',
      aprovado_por: advogado_id,
      aprovado_em: agora,
    })
    .eq('id', protesto_id)

  if (errUpdate) {
    throw new Error(`Erro ao aprovar protesto: ${errUpdate.message}`)
  }

  await registrarAuditoria(
    'PROTESTO_APROVADO',
    'protestos',
    protesto_id,
    dados_antes,
    { status: 'solicitado', aprovado_por: advogado_id, aprovado_em: agora },
    advogado_id,
  )

  // Enviar ao cartório imediatamente após aprovação
  await enviarParaCartorio(protesto_id)

  return true
}

/**
 * Envia o protesto aprovado ao cartório via gateway e-Protesto.
 * Verifica que valor > 5000 só pode ser enviado com aprovação.
 * Em modo STUB (sem API key configurada), simula a resposta.
 */
export async function enviarParaCartorio(protesto_id: string): Promise<CartorioResult> {
  const { data: protesto, error: errFetch } = await supabase
    .from('protestos')
    .select('*')
    .eq('id', protesto_id)
    .single()

  if (errFetch || !protesto) {
    return { sucesso: false, erro: 'Protesto não encontrado' }
  }

  // Camada de aplicação: bloquear envio se valor > 5000 e não aprovado
  if (protesto.valor > 5000 && !protesto.aprovado_por) {
    throw new Error('Protesto com valor acima de R$ 5.000 requer aprovação antes do envio ao cartório')
  }

  const hoje = format(new Date(), 'yyyy-MM-dd')

  try {
    let numero_protocolo: string
    let id_gateway: string
    let pdf_url_gateway: string | undefined

    if (isStubMode()) {
      console.warn('[STUB] e-Protesto não configurado — simulando resposta')
      numero_protocolo = `STUB-PROT-${Date.now()}`
      id_gateway = `stub-${protesto_id.slice(0, 8)}`
      pdf_url_gateway = undefined
    } else {
      const apiUrl = import.meta.env.VITE_EPROTESTO_API_URL as string
      const apiKey = import.meta.env.VITE_EPROTESTO_API_KEY as string

      const response = await fetch(`${apiUrl}/titulos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          protesto_id: protesto.id,
          caso_id: protesto.caso_id,
          valor: protesto.valor,
          tipo_titulo: protesto.tipo_titulo,
          data_solicitacao: protesto.data_solicitacao,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => response.statusText)
        // Manter status='solicitado' e notificar advogado
        await supabase.functions.invoke('enviar-email', {
          body: {
            subject: `Falha ao enviar protesto ao cartório — Caso ${protesto.caso_id}`,
            template: 'protesto_falha_envio',
            vars: {
              caso_id: protesto.caso_id,
              protesto_id,
              erro: errBody,
            },
          },
        }).catch(e => console.warn('[enviarParaCartorio] Edge Function e-mail indisponível:', e))

        await registrarEventoTimeline(
          protesto.caso_id,
          'PROTESTO_ERRO',
          `Falha ao enviar protesto ao cartório: ${errBody}`,
        )

        return { sucesso: false, erro: errBody }
      }

      const data = await response.json() as {
        numero_protocolo?: string
        id?: string
        id_gateway?: string
        pdf_url?: string
      }
      numero_protocolo = data.numero_protocolo ?? `PROT-${Date.now()}`
      id_gateway = data.id ?? data.id_gateway ?? `gw-${protesto_id.slice(0, 8)}`
      pdf_url_gateway = data.pdf_url
    }

    // Upload do PDF para o Storage se disponível
    let pdf_url_storage: string | undefined
    if (pdf_url_gateway) {
      try {
        const res = await fetch(pdf_url_gateway)
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer()
          const storagePath = `protestos/${protesto.caso_id}/${protesto_id}.pdf`
          const { error: errStorage } = await supabase.storage
            .from('documentos-cobranca')
            .upload(storagePath, arrayBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            })
          if (!errStorage) {
            const { data: { publicUrl } } = supabase.storage
              .from('documentos-cobranca')
              .getPublicUrl(storagePath)
            pdf_url_storage = publicUrl
          } else {
            console.warn('[enviarParaCartorio] Storage upload error:', errStorage.message)
          }
        }
      } catch (pdfErr) {
        console.warn('[enviarParaCartorio] Falha ao fazer upload do PDF:', pdfErr)
      }
    }

    // Atualizar registro do protesto
    await supabase
      .from('protestos')
      .update({
        status: 'enviado',
        numero_protocolo,
        id_gateway,
        data_envio: hoje,
        pdf_url: pdf_url_storage ?? pdf_url_gateway ?? null,
        resposta_gateway: isStubMode() ? { stub: true } : { numero_protocolo, id_gateway },
      })
      .eq('id', protesto_id)

    await registrarEventoTimeline(
      protesto.caso_id,
      'PROTESTO_ENVIADO',
      `Protesto enviado ao cartório — protocolo ${numero_protocolo}`,
    )

    return {
      sucesso: true,
      numero_protocolo,
      id_gateway,
      pdf_url: pdf_url_storage ?? pdf_url_gateway,
    }
  } catch (err) {
    console.error('[enviarParaCartorio]', err)

    await supabase.functions.invoke('enviar-email', {
      body: {
        subject: `Falha ao enviar protesto ao cartório — Caso ${protesto.caso_id}`,
        template: 'protesto_falha_envio',
        vars: {
          caso_id: protesto.caso_id,
          protesto_id,
          erro: err instanceof Error ? err.message : 'Erro desconhecido',
        },
      },
    }).catch(e => console.warn('[enviarParaCartorio] Edge Function e-mail indisponível:', e))

    await registrarEventoTimeline(
      protesto.caso_id,
      'PROTESTO_ERRO',
      `Erro ao enviar protesto: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
    )

    return {
      sucesso: false,
      erro: err instanceof Error ? err.message : 'Erro desconhecido ao enviar para cartório',
    }
  }
}

/**
 * Cancela um protesto já enviado ou protestado.
 * Chama o gateway para cancelamento e atualiza o DB.
 */
export async function cancelarProtesto(
  protesto_id: string,
  motivo: string,
  usuario_id?: string,
): Promise<boolean> {
  const { data: protesto, error: errFetch } = await supabase
    .from('protestos')
    .select('*')
    .eq('id', protesto_id)
    .single()

  if (errFetch || !protesto) {
    throw new Error('Protesto não encontrado')
  }

  const statusPermitidos = ['enviado', 'protestado', 'solicitado']
  if (!statusPermitidos.includes(protesto.status)) {
    throw new Error(`Protesto não pode ser cancelado no status '${protesto.status}'`)
  }

  try {
    if (!isStubMode() && protesto.id_gateway) {
      const apiUrl = import.meta.env.VITE_EPROTESTO_API_URL as string
      const apiKey = import.meta.env.VITE_EPROTESTO_API_KEY as string

      const response = await fetch(`${apiUrl}/titulos/${protesto.id_gateway}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => response.statusText)
        console.warn('[cancelarProtesto] Gateway retornou erro:', errBody)
        // Continuar mesmo com erro no gateway para manter consistência interna
      }
    } else if (isStubMode()) {
      console.warn('[STUB] e-Protesto não configurado — simulando cancelamento')
    }

    const hoje = format(new Date(), 'yyyy-MM-dd')
    const dados_antes = { status: protesto.status, motivo_cancelamento: protesto.motivo_cancelamento }

    await supabase
      .from('protestos')
      .update({
        status: 'cancelado',
        data_cancelamento: hoje,
        motivo_cancelamento: motivo,
      })
      .eq('id', protesto_id)

    const uid = usuario_id ?? await obterUsuarioId()

    await registrarEventoTimeline(
      protesto.caso_id,
      'PROTESTO_CANCELADO',
      `Protesto cancelado — motivo: ${motivo}`,
      uid,
    )

    await registrarAuditoria(
      'PROTESTO_CANCELADO',
      'protestos',
      protesto_id,
      dados_antes,
      { status: 'cancelado', motivo_cancelamento: motivo, data_cancelamento: hoje },
      uid,
    )

    return true
  } catch (err) {
    console.error('[cancelarProtesto]', err)
    return false
  }
}

/**
 * Consulta o status atual de um protesto no gateway e-Protesto.
 * Se o status mudou, atualiza o DB.
 */
export async function monitorarStatusProtesto(protesto_id: string): Promise<StatusProtesto> {
  const { data: protesto, error: errFetch } = await supabase
    .from('protestos')
    .select('id, status, id_gateway, numero_protocolo, caso_id')
    .eq('id', protesto_id)
    .single()

  if (errFetch || !protesto) {
    throw new Error('Protesto não encontrado')
  }

  // Sem id_gateway, retornar status atual do DB
  if (!protesto.id_gateway) {
    return {
      status: protesto.status,
      numero_protocolo: protesto.numero_protocolo ?? undefined,
    }
  }

  if (isStubMode()) {
    console.warn('[STUB] e-Protesto não configurado — retornando status do DB')
    return {
      status: protesto.status,
      numero_protocolo: protesto.numero_protocolo ?? undefined,
    }
  }

  try {
    const apiUrl = import.meta.env.VITE_EPROTESTO_API_URL as string
    const apiKey = import.meta.env.VITE_EPROTESTO_API_KEY as string

    const response = await fetch(`${apiUrl}/titulos/${protesto.id_gateway}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      console.warn('[monitorarStatusProtesto] Gateway retornou erro:', response.status)
      return { status: protesto.status }
    }

    const data = await response.json() as {
      status?: string
      numero_protocolo?: string
      data_atualizacao?: string
    }

    const novoStatus = data.status
    const dataAtualizacao = data.data_atualizacao ?? new Date().toISOString()

    // Atualizar DB se status mudou
    if (novoStatus && novoStatus !== protesto.status) {
      await supabase
        .from('protestos')
        .update({ status: novoStatus })
        .eq('id', protesto_id)

      await registrarEventoTimeline(
        protesto.caso_id,
        'PROTESTO_ATUALIZADO',
        `Status do protesto atualizado: ${protesto.status} → ${novoStatus}`,
      )
    }

    return {
      status: novoStatus ?? protesto.status,
      numero_protocolo: data.numero_protocolo ?? protesto.numero_protocolo ?? undefined,
      data_atualizacao: dataAtualizacao,
    }
  } catch (err) {
    console.error('[monitorarStatusProtesto]', err)
    return { status: protesto.status }
  }
}
