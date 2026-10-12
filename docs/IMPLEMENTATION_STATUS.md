# MeuPedido — acompanhamento de implementação

## Estratégia
Código primeiro no GitHub. Não aplicar migrações nem iniciar deploy até revisão conjunta.
MeuCaixa é um produto independente. Asaas será integrado por último.

## Migrações Neon
- Já executadas pelo proprietário anteriormente: 000_better_auth.sql, 001_organizations.sql, 002_menu_inventory.sql.
- Pendentes de execução, nesta ordem: 004_restaurant_operations.sql, 005_order_checkout.sql, 006_order_payments.sql, 007_order_management.sql, 008_inventory_recipes.sql, 009_recipes.sql, 010_cash_register.sql, 011_inventory_consumption.sql, 012_kitchen_stock_transition.sql, 013_delivery_addresses.sql, 014_delivery_checkout.sql.
- NÃO EXECUTAR 003_order_integrity.sql: rascunho legado incompatível.
- Migrações futuras deverão ser adicionadas aqui e revisadas antes de executar.

## Funcionalidades com código no repositório
- Cadastro e login via Better Auth; há erro de origem ainda não validado em produção.
- Estabelecimentos, categorias, cardápio, edição de produtos, fotos por URL e disponibilidade.
- Adicionais, PDV, pedidos, cozinha, comandas, transferência de itens e pagamentos parciais.
- Estoque, movimentações, fichas técnicas e custo estimado.
- Abertura, movimentação e fechamento de caixa.

## Atualizações recentes
- Criada função de baixa idempotente de ingredientes e endpoint explícito de consumo (011). Ainda não conectada automaticamente ao fluxo de venda; depende de validação das regras de negócio.
- Criados relatórios de vendas, meios de pagamento, produtos mais vendidos e exportação CSV.
- Os relatórios são brutos, não conciliados, e não representam lucro líquido.

- A transição de cozinha agora chama a função SQL 012; ao iniciar preparo, desconta ingredientes em transação única. Requer migrações 011 e 012 e validação em Neon.\n- Mapa de mesas em /mesas: consulta dedicada de todas as comandas abertas, sem limite artificial de 150; link para comanda selecionada.\n\n- Comandas: inclusão de produtos adicionais em pedidos abertos, usando a função SQL 007. Adicionais novos ainda não disponíveis neste formulário.\n\n## Pendências essenciais
- Verificar compilação e testes end-to-end de todos os módulos, contratos entre API e banco, políticas de autorização.
- Corrigir o login/cadastro e as origens confiáveis.
- Variantes de produto, upload seguro de fotos e organização avançada do cardápio.
- Edição de comanda no PDV, mapa de mesas, divisão de contas e descontos.
- KDS aprimorado com alertas e tempos de preparo.
- Baixa automática idempotente de ingredientes, estornos e conciliação de estoque.
- Vincular pagamentos em dinheiro ao turno de caixa, conciliar diferença no fechamento.
- Cadastro completo de clientes, endereços, delivery e retirada.
- Relatórios financeiros, exportação CSV e indicadores de vendas.
- Impressão térmica: navegador/driver ou agente local; web app isolado não imprime silenciosamente em impressoras arbitrárias.
- Configurações, permissões, logs, limites de tentativas e auditoria de segurança.
- Testes de concorrência, multiempresa, acessibilidade e responsividade.
- Asaas: trial, checkout, webhook, assinaturas e cancelamento (última etapa).

## Regra de prontidão
Commits e telas não significam sistema validado. Só marcar como pronto depois de migração, build, integração e testes reais.

## Entregas recentes (ainda sem deploy)
- PDV: seleção de cliente cadastrado ao criar pedido; cliente opcional.
- 013_delivery_addresses.sql: endereços por cliente e campos de endereço/taxa em pedidos. Executar após 012; não executar ainda sem revisar o fluxo de checkout.
- /api/restaurant/addresses: cadastro e consulta de endereços com checagem de associação ao estabelecimento.
- Pendente: integrar endereço e taxa ao checkout, selecionar endereço na interface, testar validações, conciliação e impressão.

## Delivery: estado atual
- PDV permite selecionar cliente, endereco e informar taxa de entrega.
- Migracao 014 faz checkout de delivery atomico, validando que endereco pertence ao cliente e estabelecimento.
- Pagamento e total consideram taxa, mas ainda falta revisao visual, testes de build e integracao.
- Caixa ainda nao possui conciliacao automatica. Nao executar migrações antes da revisao.

## Novas entregas em codigo
- 018/019: restricoes de integridade para pagamentos/turnos e transferencias apos inicio do preparo.
- 020/021: acompanhamento de delivery independente da cozinha, com transicoes atomicas.
- /api/restaurant/delivery e /entregas: listagem e controle de entrega por estabelecimento.
- /cozinha/imprimir: ticket de producao nao fiscal via navegador.
- CI de TypeScript em .github/workflows/typecheck.yml; aguardar resultado antes de considerar validado.
- Detalhes de pedido agora incluem endereco da entrega.
- IMPORTANTE: migrações 004 a 021 nao executadas, nao rodar 003; ainda falta revisar contratos e testes end-to-end.

## Revisao de integracao (2026-10-12)
- Corrigida validacao da taxa de delivery no PDV: expressao regular reconhece numeros decimais.
- Corrigido total visual do pedido para incluir taxa de entrega.
- Corrigido endpoint de delivery para preservar nome e telefone do entregador quando nao enviados.
- Comprovante inclui endereco e taxa de entrega.
- Cozinha retorna 409 para transicao invalida e estoque insuficiente.
- Migração 022 exige validacao em banco junto do cancelamento de pedido.
- Nao executar migrações sem backup e revisao; 004-022 ainda nao aplicadas.
- Testes de compilacao e fluxo completo ainda nao confirmados.
