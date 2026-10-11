# MeuPedido — PDV para restaurantes e lanchonetes

> Projeto em desenvolvimento. Base de referência: MeuCaixa (projeto separado; não modificar).

## Objetivo
Sistema SaaS de ponto de venda e gestão para restaurantes, lanchonetes e estabelecimentos alimentícios.

## Arquitetura planejada
- Next.js / React
- Neon PostgreSQL
- Better Auth
- Vercel
- Asaas para assinaturas

## Módulos previstos
- PDV, caixa, pagamentos, clientes, fornecedores, financeiro e relatórios.
- Estoque de produtos e insumos (unidades, entradas, saídas, inventário).
- Cardápio separado do estoque, com categorias, preços, fotos, adicionais e fichas técnicas.
- Comandas e pedidos de balcão, mesa, retirada e delivery.
- Impressão de pedidos na cozinha e comprovantes no caixa, com fila, reimpressão e tratamento de falhas.
- Painel de cozinha com estados de preparo.
- Isolamento dos dados de cada estabelecimento.

## Próximas etapas
1. Importar a base atualizada do MeuCaixa para este repositório, sem copiar segredos nem arquivos de ambiente.
2. Migrar operações Supabase para Neon e autenticação para Better Auth.
3. Implementar cardápio, fichas técnicas e baixa de insumos.
4. Implementar comandas, pedidos e impressão.
5. Validar build, testes, segurança e fluxo de caixa antes de publicar.

**Status:** documentação inicial publicada; a aplicação e a migração ainda não estão implementadas neste repositório.
