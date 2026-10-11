# Better Auth + Neon: ativação

1. Defina `DATABASE_URL` e `BETTER_AUTH_SECRET` (segredo aleatório com no mínimo 32 caracteres) como variáveis **sensitive** na Vercel. Não compartilhe valores no chat.
2. Defina `BETTER_AUTH_URL` com a URL HTTPS canônica da aplicação (sem barra final).
3. Instale as dependências com `npm install` em ambiente confiável.
4. Gere e **revise** as migrações de autenticação com `npm run auth:generate`. Execute `npm run auth:migrate` somente no banco Neon correto, após backup/validação.
5. Faça o deploy e teste `/api/health`, cadastro, login, logout e sessão.
6. Antes de liberar cadastros públicos, implemente verificação de e-mail, recuperação de senha, rate limiting, proteção de organizações e fluxos de assinatura.

**Estado:** rotas e configuração de autenticação implementadas em código; migração de tabelas, variáveis secretas, testes e fluxos de UI ainda pendentes. O sistema NÃO está pronto para usuários reais.

## Segurança
- Não copie chaves do Supabase/MeuCaixa.
- Não use a chave de banco no browser.
- Better Auth não substitui a autorização por organização em cada operação.
- Em produção, configure verificação de e-mail com o provedor de e-mails antes de permitir uso real.
