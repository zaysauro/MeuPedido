# MeuPedido — acompanhamento de implementação

## Estratégia
Código primeiro no GitHub. Não aplicar migrações nem iniciar deploy até revisão conjunta.
MeuCaixa é um produto independente. Asaas será integrado por último.

## Migrações Neon
- Já executadas pelo proprietário anteriormente: 000_better_auth.sql, 001_organizations.sql, 002_menu_inventory.sql.
- Pendentes de execução, nesta ordem: 004_restaurant_operations.sql, 005_order_checkout.sql, 006_order_payments.sql, 007_order_management.sql, 008_inventory_recipes.sql, 009_recipes.sql, 010_cash_register.sql, 011_inventory_consumption.sql.
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

## Pendências essenciais
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
