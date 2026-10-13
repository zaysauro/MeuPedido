import 'server-only';
export const emailConfigured=()=>Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM);
export async function sendAccountEmail(to:string,subject:string,url:string){
 if(!emailConfigured())throw Error('email_not_configured');
 const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,text:`MeuPedido · Kumo\n\n${subject}\n\nAcesse o link abaixo para continuar:\n${url}\n\nSe você não fez esta solicitação, ignore esta mensagem.`})});
 if(!result.ok)throw Error('email_delivery_failed');
}
