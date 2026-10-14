# MeuPedido

PDV e gestão de restaurantes da Kumo. Aplicação existente em Next.js 15, React 19, TypeScript, Neon PostgreSQL e Better Auth, publicada em https://meupedido.sistemakumo.com.br.

## Operação integrada

- O estabelecimento ativo pertence ao contexto da aplicação, é validado contra as organizações do usuário e persiste entre páginas. A troca desmonta formulários, carrinhos e consultas da organização anterior. Todas as APIs validam associação e papel no servidor.
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

Interface: seletor global, persistência e limpeza ao trocar organização, navegação recolhida, drawer, formulários/modais e layouts desktop/tablet/smartphone. O deploy não substitui homologação do restaurante.

## Homologação do proprietário

Validar uma jornada completa com operação real controlada, permissões dos funcionários, concorrência entre dispositivos, fechamento de turno, impressão física de 58/80 mm e envio efetivo de recuperação de senha. Revisar os dados comerciais e o cardápio real antes de uso diário. A assinatura é informativa; nenhuma cobrança Asaas é ativada nesta versão.
