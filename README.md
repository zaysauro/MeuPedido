# MeuPedido

PDV e gestão de restaurantes da Kumo. Aplicação existente em Next.js 15, React 19, TypeScript, Neon PostgreSQL e Better Auth, publicada em https://meupedido.sistemakumo.com.br.

## Operação integrada

- Regra comercial: um proprietário, um estabelecimento e uma assinatura. O onboarding cria o único estabelecimento de forma atômica; a interface não oferece criação adicional ou alternância. O servidor resolve o estabelecimento autorizado, ignorando preferências antigas e parâmetros de seleção. Todas as APIs operacionais conferem esse vínculo e as permissões.
- PDV → pedidos/comandas → cozinha → consumo de ingredientes → pagamentos → caixa → relatórios. Checkout e pagamentos usam chaves de idempotência; o consumo da ficha técnica é transacional e ocorre uma vez no início do preparo.
- Mesas usam a visão `restaurant_open_orders`. Uma mesa continua ocupada enquanto existir pedido não cancelado sem entrega e quitação completas. Pedidos já em preparo recebem novos itens por uma nova rodada na mesma mesa. Itens de pedidos ainda recebidos podem ser adicionados ou transferidos pelas comandas.
- `completed_at` representa conclusão operacional. O antigo `closed_at` financeiro é preservado. Pagamento antecipado não conclui o preparo nem libera a mesa. O fechamento explícito exige quitação e conclusão do atendimento.
- Delivery mantém cliente, endereço, taxa e entregador. A conclusão no módulo Entregas atualiza também o pedido; a cozinha não pode pular o despacho.
- Mutações bem-sucedidas atualizam os módulos via eventos e BroadcastChannel. Consultas visíveis são atualizadas a cada 20 segundos; cozinha tem atualização adicional de 10 segundos. Não há promessa de websocket instantâneo entre dispositivos.
- Produtos, adicionais, fichas, estoque, clientes/endereço/histórico, caixa e relatórios usam o mesmo banco. Relatórios distinguem vendas por data do pedido de recebimentos por data do pagamento, no horário de Brasília. CSV protege células contra interpretação como fórmulas.

## Executar

Requer Node.js compatível com Next.js 15. Instale com `npm ci`. Configure `.env.local` com `DATABASE_URL`, `EXPECTED_DATABASE_HOST`, `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL`. Use `.env.example` como referência; nunca versione segredos.

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

A recuperação de senha exige o provedor de e-mail configurado; consulte as variáveis documentadas no código de autenticação. Asaas permanece desativado: não configurar cobrança sem uma etapa de implantação específica. Não definir `BILLING_ENFORCED=true` nesta homologação.

## Banco e migrações

Produção: projeto Neon `frosty-forest-75298234`, banco `neondb`, branch `br-wandering-brook-b4iqzkmf`. A conexão deve corresponder ao host verificado no console, tanto na aplicação quanto nos scripts. Não executar testes com a URL de produção.

As migrações numeradas em `database/neon` são aplicadas em ordem e registradas com checksum. A migração histórica 003 não pertence à sequência aplicada. Não editar uma migração já aplicada. A 026 adiciona conclusão operacional, visão de mesas abertas e integração delivery/pedido, sem remover dados ou colunas.

Antes de qualquer aplicação em produção: criar uma branch isolada, executar a suíte real, criar ponto de recuperação da produção atual e registrar o inventário de preservação.

```sh
# .env.validation aponta EXCLUSIVAMENTE para uma branch descartável
node --env-file=.env.validation --input-type=module -e 'process.env.INTEGRATION_DATABASE_URL=process.env.MIGRATION_DATABASE_URL;await import("./tests/operations.test.mjs")'
node --env-file=.env.validation scripts/start-validation.mjs
# em outro terminal, com o servidor isolado em 127.0.0.1:4320
node tests/api-validation.mjs
```

O teste SQL cria fixtures dentro de transação e faz rollback. A suíte HTTP cria contas e dados sintéticos apenas na branch de homologação. Ela grava credenciais locais ignoradas pelo Git para inspeção do navegador. Nunca utilizar esse script contra produção.

O script `scripts/migrate.mjs` exige `MIGRATION_EXPECTED_HOST`; `--production` exige também `MIGRATION_RECOVERY_POINT` e `MIGRATION_TESTS_PASSED=true`. `scripts/verify-preservation.mjs --before` registra hashes das linhas/colunas existentes e a execução sem argumento verifica preservação. A tabela de registro de migrações recebe intencionalmente uma nova linha.

## Cobertura de validação

SQL/PGlite e PostgreSQL real: autorização, isolamento, transações, baixa de ingredientes, repetição do preparo, estoque insuficiente, pagamentos/checkout idempotentes, transferências/cancelamentos, caixa e delivery.

HTTP/Better Auth: cadastro/login/logout/sessão, proteção de páginas e APIs, origem, IDs/entradas inválidas, gerenciador de produtos, receita, pedido, cozinha, pagamentos, caixa, mesa com novas rodadas, entrega e reconciliação de dashboard/relatórios.

Interface: estabelecimento automático, onboarding único, edição do estabelecimento, ausência de seletores, navegação recolhida, drawer, formulários/modais e layouts desktop/tablet/smartphone. O deploy não substitui homologação do restaurante.

## Homologação do proprietário

Validar uma jornada completa com operação real controlada, permissões dos funcionários, concorrência entre dispositivos, fechamento de turno, impressão física de 58/80 mm e envio efetivo de recuperação de senha. Revisar os dados comerciais e o cardápio real antes de uso diário. A assinatura é informativa; nenhuma cobrança Asaas é ativada nesta versão.


## Um proprietário, um estabelecimento, uma assinatura

A migração 027 preserva todos os registros existentes. `organization_owner_claims` possui chave primária por proprietário e organização única. Um trigger também protege INSERT e promoção de membros para proprietário; tentativas simultâneas disputam a mesma chave única. `onboard_establishment` cria empresa, proprietário e configurações em uma transação, ou não cria nada. Uma conta já vinculada não pode abrir outra empresa no onboarding.

`authorized_establishment` só retorna um vínculo inequívoco com propriedade regular. Não existe escolha de empresa por URL ou localStorage. Contas com vínculos ambíguos recebem uma orientação em Meu estabelecimento e não acessam operações até regularização. Os registros continuam no banco.

Meu estabelecimento permite ao proprietário editar nome, telefone, endereço e mensagem do comprovante. Telefone/endereço/mensagem aparecem no comprovante; moeda e horário continuam BRL/Brasília, coerentes com os relatórios.

`organization_subscriptions` mantém uma linha por empresa. `organization_subscription_claims` reserva cada identificador do provedor à empresa original; triggers impedem reutilização em outra empresa e movimentação da assinatura. A autorização de cobrança futura verifica também esse vínculo. Nenhuma integração ou cobrança Asaas foi ativada.

### Auditoria e regularização sem perda

Execute `node --env-file=.env.production-migration scripts/audit-ownership.mjs` somente para leitura. A consulta identifica proprietários múltiplos, contas com vários vínculos e assinaturas compartilhadas. A view `organization_ownership_conflicts` identifica conflitos de propriedade após a migração.

Para conflitos identificados: (1) criar recuperação e inventariar organizações, usuários, operações e assinaturas; (2) obter confirmação do proprietário autorizado de cada empresa; (3) criar ou identificar uma conta proprietária distinta por empresa, sem reutilizar contas já proprietárias; (4) preparar e revisar uma transação administrativa de transferência dos vínculos e reservas de propriedade, incluindo revogação dos acessos excedentes somente após aprovação; (5) preservar os IDs das empresas, todos os usuários, pedidos, pagamentos, estoque e históricos e registrar a transferência; (6) atribuir uma assinatura futura independente por empresa, sem reaproveitar identificadores compartilhados; (7) repetir auditoria, testar login/isolation e comparar os saldos. Não executar exclusão de empresas, mesclagem ou transferência automática.

Testes adicionais: `tests/single-establishment.test.mjs` reproduz uma base legada antes da migração e verifica preservação, onboarding único, INSERT direto, promoção indevida, vínculos ambíguos e assinatura compartilhada. A suíte HTTP envia dois cadastros simultâneos pela mesma conta e exige exatamente um 201 e um 409, repete a tentativa e verifica edição/isolamento dos dados cadastrais.
