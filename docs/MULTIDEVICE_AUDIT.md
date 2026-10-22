# Auditoria multidevice — 19/10/2026

Base: migrações 004–027 aplicadas em produção; 003 é legado incompatível e permanece excluída. Better Auth próprio usa tabelas public. Não migrar para Neon Auth.

- Organização: authorized_establishment e claims exclusivos preservam vínculos legados; não há seletor. Funcionários compartilham a organização, nunca a propriedade/assinatura.
- Autorização: wrapper valida associação, mas aceitava organizationId do cliente e não distinguia funções operacionais. owner/admin/staff eram os únicos perfis.
- Pedido e comanda compartilham restaurant_orders. Itens, adicionais, mesas, clientes, pagamentos e estoque usam FKs compostas por organização.
- Checkout e pagamentos têm chave idempotente. Inclusão posterior e abertura vazia não tinham. Triggers 018 bloqueavam novos itens após preparo. Estado de itens não acompanhava estado do pedido.
- Estoque: consumo por item/ingrediente tem chave exclusiva e trava da comanda; deve continuar único. Pagamento não é criação de pedido. Dinheiro exige turno aberto. Conclusão requer entrega e pagamento.
- Cozinha: GET sem preços, mas sem IDs/estados individuais; consulta a cada 10s. Provider consulta a cada 20s e BroadcastChannel só sincroniza abas locais.
- Impressão: ticket via diálogo do navegador; sem confirmação física, fila ou agente. Não existe impressão silenciosa garantida.
- Notificações/PWA/push: ausentes. Relatórios e caixa acessíveis a qualquer membro no backend anterior.
- Concorrência: transações SQL já travam pedidos/estoque/pagamentos; reaproveitar. Transferência e cancelamento preservam histórico.

## Estratégia
Consultas seladas do Neon Realtime acompanhando estado persistido, com parâmetros derivados da sessão e rechecagem de associação na consulta. Registro de eventos na mesma transação dos dados; entrega via CDC do serviço gerenciado elimina dual-write app→broker. Reconexão recebe snapshot autoritativo. Nenhum WebSocket fica hospedado em função Vercel e nenhum polling de dados será o transporte principal. A disponibilidade e autorização do serviço precisam ser homologadas antes de publicação.

## Homologação
Branch isolada br-still-recipe-b4wec14a, expira 26/10/2026. Nenhuma fixture em produção. Build/READY não são evidência de quatro sessões funcionando.
