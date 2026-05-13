// templates.ts — Templates HTML para e-mails institucionais VINDEX
// Usado pelas Edge Functions (processar-regua, alertas-lgpd, webhook-whatsapp)
// e pelos módulos de pagamento / notificação.

// ââ SVG do ícone VINDEX para uso inline em e-mails ââââââââââââ
const VINDEX_SVG_DARK = `
<svg width="36" height="33" viewBox="0 0 60 55" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="4" x2="56" y2="4" stroke="#B79A5A" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="4,4 30,50 56,4" fill="none" stroke="#B79A5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="11,4 30,44 49,4" fill="none" stroke="#B79A5A" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="30,47 33,50 30,53 27,50" fill="#5A1220"/>
</svg>`

const VINDEX_SVG_LIGHT = `
<svg width="36" height="33" viewBox="0 0 60 55" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="4" x2="56" y2="4" stroke="#5A1220" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="4,4 30,50 56,4" fill="none" stroke="#5A1220" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="11,4 30,44 49,4" fill="none" stroke="#5A1220" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="30,47 33,50 30,53 27,50" fill="#B79A5A"/>
</svg>`

export function gerarHeaderEmailHTML(tema: 'escuro' | 'claro' = 'escuro'): string {
  const bg        = tema === 'escuro' ? '#0E1B2A' : '#F6F2EC'
  const borderClr = '#B79A5A'
  const nomeClr   = tema === 'escuro' ? '#B79A5A' : '#5A1220'
  const svg       = tema === 'escuro' ? VINDEX_SVG_DARK : VINDEX_SVG_LIGHT

  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${bg}; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
  <tr>
    <td style="padding:24px 32px; border-bottom:2px solid ${borderClr}">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle; padding-right:12px">${svg}</td>
          <td style="vertical-align:middle">
            <span style="font-family:Georgia,serif; font-size:20px; font-weight:700;
                         color:${nomeClr}; letter-spacing:5px">VINDEX</span>
            <br>
            <span style="font-family:Arial,sans-serif; font-size:10px; font-weight:300;
                         color:${tema === 'escuro' ? '#C7CBD1' : '#666666'}; letter-spacing:1px">
              A Legal Desk da A&amp;C Advogados
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

export function gerarRodapeEmailHTML(): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#06101a; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
  <tr><td style="padding:1px 0; background:#B79A5A; height:2px"></td></tr>
  <tr>
    <td style="padding:20px 32px; text-align:center">
      <p style="font-family:Georgia,serif; font-size:10px; color:#B79A5A;
                letter-spacing:2px; margin:0 0 8px 0">
        DIREITO QUE RECUPERA. ESTRATÉGIA QUE PROTEGE.
      </p>
      <p style="font-family:Arial,sans-serif; font-size:11px; color:#555555; margin:0 0 4px 0">
        ANDRADE &amp; CINTRA Advogados — VINDEX Legal Desk
      </p>
      <p style="font-family:Arial,sans-serif; font-size:10px; color:#444444; margin:0">
        jgac@cintraadvogados.com &nbsp;|&nbsp;
        (11) 99607-1463 &nbsp;|&nbsp;
        www.andradecintra.com.br
      </p>
    </td>
  </tr>
</table>`
}

// ââ Template de notificação ao devedor (tema escuro) ââââââââââ
export function templateNotificacaoDevedor(params: {
  nomeDevedor: string
  valorAtualizado: string
  prazo: string
  linkPortal?: string
  nomeAdvogado: string
}): string {
  const { nomeDevedor, valorAtualizado, prazo, linkPortal, nomeAdvogado } = params
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06101a">
  ${gerarHeaderEmailHTML('escuro')}
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0a1420; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
    <tr>
      <td style="padding:32px">
        <p style="font-family:Arial,sans-serif; font-size:14px; color:#C7CBD1; margin:0 0 16px">
          Prezado(a) <strong style="color:#F6F2EC">${nomeDevedor}</strong>,
        </p>
        <p style="font-family:Arial,sans-serif; font-size:14px; color:#8a9ab0; margin:0 0 24px; line-height:1.6">
          Informamos que existe um débito em seu nome junto ao nosso escritório, no valor atualizado de:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#06101a; border:1px solid rgba(183,154,90,0.25); border-radius:8px; margin-bottom:24px">
          <tr>
            <td style="padding:20px; text-align:center">
              <p style="font-family:Arial,sans-serif; font-size:11px; color:#B79A5A;
                        letter-spacing:2px; text-transform:uppercase; margin:0 0 8px">Valor em Aberto</p>
              <p style="font-family:Georgia,serif; font-size:28px; font-weight:700;
                        color:#F6F2EC; margin:0">${valorAtualizado}</p>
              <p style="font-family:Arial,sans-serif; font-size:11px; color:#555; margin:8px 0 0">
                Prazo para regularização: <strong style="color:#B79A5A">${prazo}</strong>
              </p>
            </td>
          </tr>
        </table>
        ${linkPortal ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px">
          <tr>
            <td style="text-align:center">
              <a href="${linkPortal}"
                 style="display:inline-block; background:#B79A5A; color:#0E1B2A;
                        font-family:Georgia,serif; font-size:13px; font-weight:700;
                        letter-spacing:2px; padding:14px 32px; border-radius:6px;
                        text-decoration:none">
                VER PROPOSTA DE REGULARIZAÇÃO
              </a>
            </td>
          </tr>
        </table>` : ''}
        <p style="font-family:Arial,sans-serif; font-size:13px; color:#666; margin:0 0 8px">
          Atenciosamente,
        </p>
        <p style="font-family:Arial,sans-serif; font-size:13px; color:#C7CBD1; margin:0">
          <strong>${nomeAdvogado}</strong><br>
          <span style="color:#555; font-size:11px">ANDRADE &amp; CINTRA Advogados — VINDEX Legal Desk</span>
        </p>
      </td>
    </tr>
  </table>
  ${gerarRodapeEmailHTML()}
</body>
</html>`
}

// ââ Template de alerta LGPD ao advogado ââââââââââââââââââââââ
export function templateAlertaLGPD(params: {
  nomeDevedor: string
  tipoDireito: string
  prazoResposta: string
  casoId: string
}): string {
  const { nomeDevedor, tipoDireito, prazoResposta, casoId } = params
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06101a">
  ${gerarHeaderEmailHTML('escuro')}
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0a1420; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
    <tr>
      <td style="padding:32px">
        <div style="border-left:3px solid #ef4444; padding-left:16px; margin-bottom:24px">
          <p style="font-family:Georgia,serif; font-size:14px; color:#ef4444;
                    letter-spacing:1px; margin:0 0 4px; font-weight:700">â  ALERTA LGPD — PRAZO CRÃTICO</p>
          <p style="font-family:Arial,sans-serif; font-size:12px; color:#8a9ab0; margin:0">
            Prazo de resposta vencendo em breve
          </p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#06101a; border:1px solid rgba(183,154,90,0.2); border-radius:6px; margin-bottom:20px">
          <tr>
            <td style="padding:16px">
              <p style="font-family:Arial,sans-serif; font-size:11px; color:#B79A5A; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px">Titular</p>
              <p style="font-family:Arial,sans-serif; font-size:14px; color:#F6F2EC; margin:0 0 12px; font-weight:700">${nomeDevedor}</p>
              <p style="font-family:Arial,sans-serif; font-size:11px; color:#B79A5A; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px">Direito Solicitado</p>
              <p style="font-family:Arial,sans-serif; font-size:13px; color:#C7CBD1; margin:0 0 12px">${tipoDireito}</p>
              <p style="font-family:Arial,sans-serif; font-size:11px; color:#B79A5A; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px">Prazo de Resposta</p>
              <p style="font-family:Arial,sans-serif; font-size:13px; color:#ef4444; margin:0; font-weight:700">${prazoResposta}</p>
            </td>
          </tr>
        </table>
        <p style="font-family:Arial,sans-serif; font-size:12px; color:#555; margin:0">
          ID do caso: <code style="color:#B79A5A">${casoId}</code>
        </p>
      </td>
    </tr>
  </table>
  ${gerarRodapeEmailHTML()}
</body>
</html>`
}

// ââ Template de confirmação de pagamento ao credor ââââââââââââ
export function templateConfirmacaoPagamento(params: {
  nomeCredor: string
  valorPago: string
  nomeDevedor: string
  dataPagamento: string
  nomeAdvogado: string
}): string {
  const { nomeCredor, valorPago, nomeDevedor, dataPagamento, nomeAdvogado } = params
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F6F2EC">
  ${gerarHeaderEmailHTML('claro')}
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#ffffff; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
    <tr>
      <td style="padding:32px">
        <p style="font-family:Arial,sans-serif; font-size:14px; color:#333; margin:0 0 16px">
          Prezado(a) <strong>${nomeCredor}</strong>,
        </p>
        <div style="background:#f0faf0; border:1px solid #4ade80; border-radius:8px; padding:20px; margin-bottom:24px; text-align:center">
          <p style="font-family:Arial,sans-serif; font-size:11px; color:#16a34a; letter-spacing:2px; text-transform:uppercase; margin:0 0 8px">â Pagamento Confirmado</p>
          <p style="font-family:Georgia,serif; font-size:26px; font-weight:700; color:#0E1B2A; margin:0">${valorPago}</p>
          <p style="font-family:Arial,sans-serif; font-size:11px; color:#666; margin:8px 0 0">
            Devedor: <strong>${nomeDevedor}</strong> Â· Data: ${dataPagamento}
          </p>
        </div>
        <p style="font-family:Arial,sans-serif; font-size:13px; color:#555; margin:0 0 8px">Atenciosamente,</p>
        <p style="font-family:Arial,sans-serif; font-size:13px; color:#333; margin:0">
          <strong>${nomeAdvogado}</strong><br>
          <span style="font-size:11px; color:#888">ANDRADE &amp; CINTRA Advogados — VINDEX Legal Desk</span>
        </p>
      </td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#F6F2EC; max-width:600px; margin:0 auto; font-family:Arial,sans-serif">
    <tr><td style="padding:1px 0; background:#B79A5A; height:1px"></td></tr>
    <tr>
      <td style="padding:16px 32px; text-align:center">
        <p style="font-family:Georgia,serif; font-size:9px; color:#B79A5A; letter-spacing:2px; margin:0 0 4px">
          DIREITO QUE RECUPERA. ESTRATÉGIA QUE PROTEGE.
        </p>
        <p style="font-family:Arial,sans-serif; font-size:10px; color:#888; margin:0">
          ANDRADE &amp; CINTRA Advogados — VINDEX Legal Desk
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}
