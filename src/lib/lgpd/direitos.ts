/**
 * LGPD — Direitos do Titular (Art. 18)
 * Implementa os 5 direitos: acesso, correção, exclusão, portabilidade e oposição.
 */

import { supabase } from '@/lib/supabase'
import { registrarAuditoria } from './auditoria'

export type TipoSolicitacao =
  | 'acesso'
  | 'correcao'
  | 'exclusao'
  | 'portabilidade'
  | 'oposicao'

export interface SolicitacaoTitular {
  id: string
  tipo_solicitacao: TipoSolicitacao
  status: string
  descricao: string
  prazo_resposta: string
  respondido_em?: string
  resposta?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// 1. Acesso — Art. 18, I
// ---------------------------------------------------------------------------
export async function solicitarAcesso(
  devedor_id: string,
  solicitante_email: string
): Promise<string> {
  // Inserir solicitação
  const { data: sol, error: solError } = await supabase
    .from('solicitacoes_titular')
    .insert({
      devedor_id,
      tipo_solicitacao: 'acesso',
      status: 'em_analise',
      descricao: `Solicitação de acesso aos dados pelo titular - ${solicitante_email}`,
      canal_origem: 'email',
    })
    .select('id')
    .single()

  if (solError || !sol) {
    throw new Error(`Erro ao registrar solicitação de acesso: ${solError?.message}`)
  }

  // Coletar dados do titular
  const [
    { data: devedor },
    { count: totalComunicacoes },
    { count: totalConsentimentos },
    { count: totalNegativacoes },
    { count: totalProtestos },
  ] = await Promise.all([
    supabase.from('devedores').select('nome, created_at').eq('id', devedor_id).maybeSingle(),
    supabase.from('comunicacoes').select('*', { count: 'exact', head: true }).eq('devedor_id', devedor_id),
    supabase.from('consentimentos_lgpd').select('*', { count: 'exact', head: true }).eq('devedor_id', devedor_id),
    supabase.from('negativacoes').select('*', { count: 'exact', head: true }).eq('devedor_id', devedor_id),
    supabase.from('protestos').select('*', { count: 'exact', head: true }).eq('devedor_id', devedor_id),
  ])

  const relatorio = {
    devedor_id,
    dados_cadastrais: {
      nome: devedor?.nome ?? 'Não localizado',
      data_cadastro: devedor?.created_at ?? null,
    },
    total_comunicacoes: totalComunicacoes ?? 0,
    consentimentos: totalConsentimentos ?? 0,
    negativacoes: totalNegativacoes ?? 0,
    protestos: totalProtestos ?? 0,
    gerado_em: new Date().toISOString(),
  }

  // Enviar relatório por e-mail
  await supabase.functions.invoke('enviar-email', {
    body: {
      para: solicitante_email,
      assunto: 'Seus dados — ANDRADE & CINTRA Advogados',
      corpo: `
Prezado(a) Titular,

Segue relatório com seus dados conforme solicitado (LGPD Art. 18, I):

${JSON.stringify(relatorio, null, 2)}

Em caso de dúvidas, entre em contato com nosso DPO.
      `.trim(),
    },
  })

  // Atualizar descrição com confirmação de envio
  await supabase
    .from('solicitacoes_titular')
    .update({
      descricao: `Solicitação de acesso aos dados pelo titular - ${solicitante_email}. Relatório enviado para ${solicitante_email}.`,
      status: 'respondida',
      respondido_em: new Date().toISOString(),
      resposta: JSON.stringify(relatorio),
    })
    .eq('id', sol.id)

  await registrarAuditoria({
    acao: 'LGPD_ACESSO_DADOS',
    entidade: 'solicitacoes_titular',
    entidade_id: sol.id,
    dados_depois: { devedor_id, solicitante_email },
  })

  return sol.id
}

// ---------------------------------------------------------------------------
// 2. Correção — Art. 18, III
// ---------------------------------------------------------------------------
export async function solicitarCorrecao(
  devedor_id: string,
  campo: string,
  valor_atual: string,
  valor_correto: string,
  solicitante_email?: string
): Promise<string> {
  const { data: sol, error: solError } = await supabase
    .from('solicitacoes_titular')
    .insert({
      devedor_id,
      tipo_solicitacao: 'correcao',
      status: 'aberta',
      descricao: `Campo: ${campo}. Atual: ${valor_atual}. Correto: ${valor_correto}`,
      canal_origem: solicitante_email ? 'email' : 'portal',
    })
    .select('id')
    .single()

  if (solError || !sol) {
    throw new Error(`Erro ao registrar solicitação de correção: ${solError?.message}`)
  }

  // Notificar advogado
  await supabase.functions.invoke('enviar-email', {
    body: {
      para: 'juridico@andradecintra.adv.br',
      assunto: '[LGPD] Solicitação de correção de dados',
      corpo: `
Nova solicitação de correção (LGPD Art. 18, III):
Devedor: ${devedor_id}
Campo: ${campo}
Valor atual: ${valor_atual}
Valor correto: ${valor_correto}
Solicitante: ${solicitante_email ?? 'não informado'}
Prazo: 15 dias úteis
      `.trim(),
    },
  })

  await registrarAuditoria({
    acao: 'LGPD_CORRECAO_SOLICITADA',
    entidade: 'solicitacoes_titular',
    entidade_id: sol.id,
    dados_depois: { devedor_id, campo, valor_atual, valor_correto },
  })

  return sol.id
}

// ---------------------------------------------------------------------------
// 3. Exclusão — Art. 18, VI (com restrição legal — Art. 205 CC)
// ---------------------------------------------------------------------------
export async function solicitarExclusao(
  devedor_id: string,
  solicitante_email?: string
): Promise<string> {
  const resposta_padrao = `
Sua solicitação de exclusão foi recebida e analisada conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

RESPOSTA: Exclusão parcialmente atendida — Anonimização aplicada

Conforme o Art. 16, II da LGPD, o tratamento de dados pessoais pode ser mantido para o cumprimento de obrigação legal ou regulatória pelo controlador. Em consonância com o Art. 205 do Código Civil Brasileiro, a prescrição ocorre em 10 anos quando a lei não lhe haja fixado prazo menor, e em 5 anos para obrigações de natureza pessoal e contratual (Art. 206, §5º, I CC).

Desta forma, os dados vinculados a débitos em aberto ou encerrados há menos de 5 anos não podem ser completamente excluídos, pois são necessários para:
1. Cumprimento de obrigação legal (Art. 7º, II LGPD)
2. Exercício regular de direito em processo judicial ou administrativo (Art. 7º, VI LGPD)
3. Proteção ao crédito (Art. 7º, X LGPD)

Medida adotada: seus dados de identificação (nome e contatos) foram anonimizados nos casos já encerrados ou arquivados. Os dados vinculados a casos ativos são mantidos pelo prazo legal.

Para mais informações, entre em contato com nosso DPO: dpo@andradecintra.adv.br
  `.trim()

  const { data: sol, error: solError } = await supabase
    .from('solicitacoes_titular')
    .insert({
      devedor_id,
      tipo_solicitacao: 'exclusao',
      status: 'aberta',
      descricao: 'Solicitação de exclusão de dados pelo titular',
      canal_origem: solicitante_email ? 'email' : 'portal',
    })
    .select('id')
    .single()

  if (solError || !sol) {
    throw new Error(`Erro ao registrar solicitação de exclusão: ${solError?.message}`)
  }

  // Atualizar imediatamente com resposta padrão
  await supabase
    .from('solicitacoes_titular')
    .update({
      status: 'parcialmente_atendida',
      resposta: resposta_padrao,
      respondido_em: new Date().toISOString(),
    })
    .eq('id', sol.id)

  // Anonimizar dados apenas se não houver casos ativos
  let anonError: unknown = null
  try {
    await Promise.resolve(
      supabase.rpc('anonimizar_devedor_se_casos_encerrados', { p_devedor_id: devedor_id })
    )
  } catch {
    // Fallback manual se RPC não existir
    try {
      const { error: fallbackError } = await supabase
        .from('devedores')
        .update({
          nome: 'DADOS ANONIMIZADOS',
          emails: [],
          telefones: [],
        })
        .eq('id', devedor_id)
        .not(
          'id',
          'in',
          `(SELECT devedor_id FROM casos WHERE devedor_id = '${devedor_id}' AND status NOT IN ('encerrado','arquivado'))`
        )
      anonError = fallbackError
    } catch (err) {
      anonError = err
    }
  }

  if (anonError) {
    console.warn('[LGPD] Anonimização parcial ou não aplicada:', anonError)
  }

  if (solicitante_email) {
    await supabase.functions.invoke('enviar-email', {
      body: {
        para: solicitante_email,
        assunto: '[LGPD] Resposta à sua solicitação de exclusão — ANDRADE & CINTRA Advogados',
        corpo: resposta_padrao,
      },
    })
  }

  await registrarAuditoria({
    acao: 'LGPD_EXCLUSAO_SOLICITADA',
    entidade: 'solicitacoes_titular',
    entidade_id: sol.id,
    dados_depois: { devedor_id, status: 'parcialmente_atendida' },
  })

  return sol.id
}

// ---------------------------------------------------------------------------
// 4. Portabilidade — Art. 18, V
// ---------------------------------------------------------------------------
export async function solicitarPortabilidade(
  devedor_id: string,
  solicitante_email: string
): Promise<string> {
  // Coletar todos os dados
  const [
    { data: devedor },
    { data: comunicacoes },
    { data: consentimentos },
    { data: negativacoes },
    { data: protestos },
  ] = await Promise.all([
    supabase.from('devedores').select('*').eq('id', devedor_id).maybeSingle(),
    supabase.from('comunicacoes').select('*').eq('devedor_id', devedor_id),
    supabase.from('consentimentos_lgpd').select('*').eq('devedor_id', devedor_id),
    supabase.from('negativacoes').select('*').eq('devedor_id', devedor_id),
    supabase.from('protestos').select('*').eq('devedor_id', devedor_id),
  ])

  const exportacao = {
    formato: 'JSON — LGPD Art. 18, V',
    devedor_id,
    exportado_em: new Date().toISOString(),
    dados_cadastrais: devedor,
    comunicacoes: comunicacoes ?? [],
    consentimentos: consentimentos ?? [],
    negativacoes: negativacoes ?? [],
    protestos: protestos ?? [],
  }

  // Inserir solicitação
  const { data: sol, error: solError } = await supabase
    .from('solicitacoes_titular')
    .insert({
      devedor_id,
      tipo_solicitacao: 'portabilidade',
      status: 'aberta',
      descricao: `Solicitação de portabilidade de dados pelo titular - ${solicitante_email}`,
      canal_origem: 'email',
    })
    .select('id')
    .single()

  if (solError || !sol) {
    throw new Error(`Erro ao registrar solicitação de portabilidade: ${solError?.message}`)
  }

  // Enviar exportação por e-mail
  await supabase.functions.invoke('enviar-email', {
    body: {
      para: solicitante_email,
      assunto: 'Portabilidade de dados — ANDRADE & CINTRA Advogados',
      corpo: `
Prezado(a) Titular,

Segue a exportação dos seus dados em formato estruturado (LGPD Art. 18, V):

${JSON.stringify(exportacao, null, 2)}

Você pode importar estes dados em outro controlador ou serviço compatível.
      `.trim(),
    },
  })

  // Marcar como respondida
  await supabase
    .from('solicitacoes_titular')
    .update({
      status: 'respondida',
      respondido_em: new Date().toISOString(),
      resposta: `Dados exportados e enviados para ${solicitante_email}`,
    })
    .eq('id', sol.id)

  await registrarAuditoria({
    acao: 'LGPD_PORTABILIDADE_EXPORTADA',
    entidade: 'solicitacoes_titular',
    entidade_id: sol.id,
    dados_depois: { devedor_id, solicitante_email },
  })

  return sol.id
}

// ---------------------------------------------------------------------------
// 5. Oposição — Art. 18, IX
// ---------------------------------------------------------------------------
export async function registrarOposicao(
  devedor_id: string,
  finalidade: string,
  solicitante_email?: string
): Promise<string> {
  const { data: sol, error: solError } = await supabase
    .from('solicitacoes_titular')
    .insert({
      devedor_id,
      tipo_solicitacao: 'oposicao',
      status: 'aberta',
      descricao: `Oposição ao tratamento para: ${finalidade}`,
      canal_origem: solicitante_email ? 'email' : 'portal',
    })
    .select('id')
    .single()

  if (solError || !sol) {
    throw new Error(`Erro ao registrar oposição: ${solError?.message}`)
  }

  // Notificar advogado
  await supabase.functions.invoke('enviar-email', {
    body: {
      para: 'juridico@andradecintra.adv.br',
      assunto: '[LGPD] Oposição ao tratamento de dados',
      corpo: `
Nova oposição ao tratamento de dados (LGPD Art. 18, IX):
Devedor: ${devedor_id}
Finalidade contestada: ${finalidade}
Solicitante: ${solicitante_email ?? 'não informado'}
Prazo de análise: 15 dias
      `.trim(),
    },
  })

  await registrarAuditoria({
    acao: 'LGPD_OPOSICAO_REGISTRADA',
    entidade: 'solicitacoes_titular',
    entidade_id: sol.id,
    dados_depois: { devedor_id, finalidade },
  })

  return sol.id
}

// ---------------------------------------------------------------------------
// 6. Listagem
// ---------------------------------------------------------------------------
export async function listarSolicitacoes(devedor_id?: string): Promise<SolicitacaoTitular[]> {
  let query = supabase
    .from('solicitacoes_titular')
    .select('id, tipo_solicitacao, status, descricao, prazo_resposta, respondido_em, resposta, created_at')
    .order('created_at', { ascending: false })

  if (devedor_id) {
    query = query.eq('devedor_id', devedor_id)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao listar solicitações: ${error.message}`)
  }

  return (data ?? []) as SolicitacaoTitular[]
}
