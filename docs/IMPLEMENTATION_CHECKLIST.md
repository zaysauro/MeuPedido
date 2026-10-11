# Plano de implementação — MeuPedido

**Estado:** o código herdado do MeuCaixa ainda depende do Supabase. Nenhuma migração foi executada no Neon.

## 1. Infraestrutura
- Inventariar autenticação, RLS, RPCs, storage, webhooks e dependências Supabase.
- Migrar autenticação para Better Auth e persistência para Neon/PostgreSQL.
- Criar organização, usuários, permissões e checagens de isolamento no servidor.
- Migrar vendas, caixa, estoque, financeiro, clientes, fornecedores, relatórios e cobrança Asaas.
- Validar build, testes de segurança e acesso entre empresas.

## 2. Restaurante
- Estoque de insumos e produtos prontos, inventário e movimentações.
- Cardápio separado, categorias, fotos, preços, adicionais e fichas técnicas.
- Comandas de balcão, mesa, retirada e delivery, com histórico de mudanças.
- Baixa transacional e idempotente de insumos conforme ficha técnica.
- Pagamento parcial, divisão de conta e fechamento no caixa.
- Fila de impressão com destinos independentes para cozinha e caixa.
- Agente local autenticado para impressão automática, reimpressão e retentativas.
- Painel de cozinha (recebido, preparando, pronto, entregue).

## Critérios de aceite
1. Pedido com adicionais aparece corretamente na cozinha e no caixa.
2. Falha de impressora não perde pedido; impressão pode ser retomada.
3. Requisições repetidas não duplicam vendas, baixa de estoque nem impressão.
4. Dados de uma empresa nunca são acessíveis por outra.
5. Nenhum segredo é exposto ao navegador.
6. Testes e build aprovados antes de qualquer deploy.

**Atenção:** estes documentos não representam funcionalidade implementada. Os SQLs 001/002/003 dependem da migração do núcleo de autenticação/organizações e não devem ser aplicados isoladamente em produção.
