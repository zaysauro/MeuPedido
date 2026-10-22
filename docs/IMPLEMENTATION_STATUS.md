# MeuPedido — homologação multidevice, 22/10/2026

## Publicação

- Código funcional: `81b5b683789d0ea5594d6317adad60ab71994aeb`, branch `codex/multidevice-homologacao-20261022`.
- Preview Vercel READY: `dpl_3HkF5E5sx7PQXDe9Qi3PrdK8Z44a`, https://meupedido-en6zop9mt-bruno-02a0.vercel.app.
- Alias: https://meupedido-git-codex-multidevice-homologacao-20261022-bruno-02a0.vercel.app.
- Proteção Vercel mantida; link temporário privado entregue ao proprietário. Nunca publicar tokens ou senhas de teste no Git.
- Produção permanece no commit `479bb479257a241acbaefcad97eb59fd5ad7c04e`. Dados de produção não foram alterados nesta entrega.

## Arquitetura e funcionalidades

Next.js continua como API e aplicação única, Better Auth autentica cada funcionário e PostgreSQL determina estabelecimento e permissões. Neon Realtime entrega snapshots autorizados por sessão/estabelecimento. Mudanças confirmadas atualizam a versão operacional e notificações na mesma transação. O cliente reconcilia com as APIs, renova autorizações e recupera snapshots após reconexão. Não há polling operacional periódico nem sockets mantidos nas funções Vercel.

O registro durável de eventos origina as notificações; o transporte ao vivo acompanha commits do Postgres, eliminando a publicação HTTP externa entre commit e entrega. Web Push tem entregas persistentes por evento/dispositivo, leases, idempotência e backoff.

- Uma conta proprietária, um estabelecimento, uma assinatura; criação adicional bloqueada, dados legados preservados.
- Proprietário, gerente com grants opcionais, caixa, garçom e cozinha; autorização no backend, organização derivada da sessão.
- Mesma comanda entre garçons, caixa e cozinha; rodadas com batch próprio; pedidos/pagamentos idempotentes.
- KDS por item, sem preços, com tempos, notas, adicionais e recebido/preparando/pronto/entregue.
- Estoque transacional por item; cancelamento de item preparado bloqueado sob lock.
- Notificações com histórico, não lidas, leitura e sons distintos opt-in.
- PWA com manifest, ícones, offline e atualização explícita; cache só público. VAPID configurado no preview; push por usuário/dispositivo/organização, com cleanup no logout.
- Digital/impressão/híbrido, jobs por rodada, ticket térmico, reimpressão idempotente e histórico de falhas. Impressão pelo diálogo do navegador e confirmação humana.

## Neon

Projeto `frosty-forest-75298234`, branch isolada `br-still-recipe-b4wec14a`, cópia da produção em 19/10, expira em 26/10/2026. Migrations 028–036 aplicadas somente nela. A base 004–027 já estava aplicada anteriormente em produção. Nenhuma migration destrutiva ou exclusão de clientes. Fixtures em organizações novas no banco isolado. Realtime habilitado com origens explícitas. Cobrança Asaas desativada; `BILLING_ENFORCED=false`.

## Testes e evidências

- `npm run typecheck`: PASS.
- `npm test`: 16 PASS, zero falhas.
- `npm run build`: PASS; build remoto READY.
- HTTP local com Neon real: quatro sessões, fluxo garçom/cozinha/caixa, dois garçons, duas cozinhas, rodadas posteriores, estoque/pagamento sem duplicação, reconexão e sessão expirada: PASS.
- Staff HTTP: convites concorrentes, perfis, grants, isolamento, origem, revogação/reativação e segunda empresa proibida: PASS.
- Duas conexões Postgres: preparo/cancelamento, cancelamento/preparo, pagamento/cancelamento e pagamento repetido: 4/4 PASS.
- Neon WebSocket: quatro conexões, commit, rollback, outro estabelecimento e revogação: PASS.
- Preview publicado: health200 conectado, quatro logins/subscriptions reais, pedido do garçom no KDS e caixa, preparo, aviso de pronto e entrega: PASS. Rotas mesas/PDV/comandas/cozinha/funcionários/notificações/configurações e recursos PWA: HTTP200.
- PWA/push automatizado: endpoints, SSRF, cache seguro, retries e remoção de inscrições inválidas com provedor controlado. Não comprova entrega pelo sistema operacional.

## Pendências reais

1. Homologação visual/interativa em celulares reais; controle do computador aguardava permissões do sistema. Os testes multidevice acima usam API/SDK e sessões independentes, não quatro navegadores automatizados.
2. Instalação física da PWA, áudio e recebimento Web Push em iOS/Android compatíveis.
3. Scheduler de recuperação push: endpoint protegido e worker prontos, mas agendamento externo não provisionado. Dispatch após mutações implementado; entrega garantida em segundo plano não está homologada.
4. Impressora física/driver não homologados; não existe impressão silenciosa universal.
5. Novo login atualiza imediatamente o menu após alteração de role/grants. O servidor aplica a permissão nova em cada requisição; refresh instantâneo dessa navegação pode ser ampliado.
6. Produção requer recovery point atualizado, migrations028–036 e realtime/push produtivos após homologação. READY do preview não significa aprovação final de produção.

## Computador e dois celulares

Abra o link privado nos três dispositivos. Use logins individuais do mesmo estabelecimento: caixa no computador, cozinha em um celular e garçom no outro. Abra o turno no caixa. No garçom, escolha a mesa e envie pedido pelo PDV. Na cozinha, inicie preparo e marque pronto. No garçom, registre entrega; no caixa, receba pagamento. Confira a mesa livre. Repita adicionando uma segunda rodada e confira que a primeira não é reenviada.

Detalhes: [auditoria](MULTIDEVICE_AUDIT.md), [realtime/impressão](REALTIME_AND_PRINTING.md) e [PWA](PWA.md).
