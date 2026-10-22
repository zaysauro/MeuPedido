# Sincronização operacional e impressão

## Arquitetura

As transações de pedidos, itens, pagamentos, mesas e caixa gravam `restaurant_events`, os destinatários em `restaurant_notifications` e uma versão do estabelecimento em `restaurant_live_versions`. Tudo confirma ou reverte junto com a operação. Os eventos são registros persistentes, usados como outbox transacional; não há uma chamada de publicação antes do commit nem uma segunda gravação externa que possa se perder.

O transporte é **Neon Realtime**, por WebSocket gerenciado pelo Neon, observando commits do PostgreSQL. A Vercel emite apenas consultas seladas de curta duração; não mantém servidores WebSocket. O navegador assina duas consultas: a versão autorizada do estabelecimento e seus próprios avisos recentes. Ao mudar a versão, as telas consultam novamente as APIs autenticadas. Após reconectar, o snapshot atual substitui o estado anterior e dispara a reconciliação, incluindo alterações ocorridas durante a desconexão. Nenhum timer consulta pedidos periodicamente. A renovação das capabilities, aproximadamente a cada 50 segundos, serve à autorização, não ao polling de dados.

Referências oficiais: [consultas e autorização](https://neon.com/docs/realtime/guides/queries), [assinaturas, reconexão e renovação](https://neon.com/docs/realtime/guides/subscribing), [SDK TypeScript](https://neon.com/docs/realtime/sdks/typescript).

### Autorização e limites verificados

- `GET /api/realtime` usa a sessão Better Auth e `authorized_establishment()`. O navegador não escolhe a empresa ou o usuário da assinatura.
- Os tokens são criptografados e vinculados à consulta, ao banco, à empresa, ao usuário e à sessão. A chave `NEON_REALTIME_SECRET` permanece no servidor; tokens não vão para URL, logs ou armazenamento persistente do cliente.
- O SDK 0.1.1 emite tokens com duração fixa de 60 segundos. O endpoint não emite um token se restarem menos de 65 segundos da sessão, evitando que uma capability ultrapasse a sessão de login.
- Cada consulta inclui a sessão, o vínculo ativo, o proprietário autorizado e a ausência de vínculos conflitantes. Revogar um funcionário ou invalidar a sessão retira as linhas da consulta ao vivo. O aplicativo limpa o contexto e redireciona para login com `meupedido:session-expired`.
- O serviço real rejeitou a função SQL `authorized_establishment()` dentro da consulta ao vivo com `unsupported query: scalar expression uses a non-built-in function`. Por isso `realtime-queries.ts` usa joins e subconsultas equivalentes. O endpoint REST continua usando a função existente. Esta limitação foi descoberta no teste real, apesar da documentação geral mencionar suporte a funções definidas pelo usuário.
- As notificações são filtradas pelo destinatário e pelo perfil atual. Contêm identificação do pedido/mesa e texto operacional, sem valores financeiros. Cozinha não recebe notificações de caixa/pagamento.
- A versão é apenas um contador sem dados de outros clientes. O snapshot materializado e IDs de evento deduplicam entregas repetidas. O cliente limita histórico a 100 avisos e memória de deduplicação; o histórico completo continua no banco.

### Configuração

Ativar Realtime na **mesma branch** do `DATABASE_URL`, com uma lista explícita de origens permitidas. Definir no servidor `NEON_REALTIME_URL` e `NEON_REALTIME_SECRET`; não usar prefixos públicos. A branch de homologação é `br-still-recipe-b4wec14a`, com origens `http://localhost:4320` e `http://127.0.0.1:4320`. Sua configuração local está no arquivo ignorado `.env.realtime-validation`. Esse segredo e essa URL não devem ser reutilizados em produção.

Sem infraestrutura configurada, a interface apresenta “Sincronização ainda não configurada”; não simula que os dispositivos estão sincronizados. A implantação em produção deve configurar e verificar sua própria branch antes de declarar este fluxo homologado.

## Notificações dentro do sistema

`OperationalLive` é montado uma única vez por usuário/estabelecimento. Apresenta conexão, avisos não lidos, histórico, leitura individual ou em grupo e preferências de som persistidas. `/notificacoes` abre a central existente, inclusive quando acessada por Web Push. O som só é liberado após uma ação explícita no navegador; pedido novo e pedido pronto usam tons diferentes. O primeiro snapshot não reproduz sons antigos. Reconexões deduplicam IDs; avisos recebidos em lote geram no máximo um som a cada dois segundos. Não autorizar áudio ou push não impede o fluxo de pedidos.

Web Push e service worker estão documentados separadamente em [PWA.md](PWA.md).

## Impressão opcional

`031_optional_printing.sql` adiciona configurações por empresa, jobs com snapshot imutável por lote e histórico de tentativas. Os modos são digital, impressão e híbrido; o KDS permanece disponível em todos. O nome da impressora identifica o equipamento e o papel pode ter 58 ou 80 mm.

Nos modos impressão/híbrido, um trigger diferido cria o job somente ao final da transação, depois dos itens e adicionais. A chave do lote evita duplicar a impressão por repetição do pedido. Novos itens geram outro lote com somente seus próprios itens. O modo digital ainda permite solicitar uma impressão manual de um lote. Não há acesso financeiro nos snapshots.

`/cozinha/imprimir` apresenta fila, lote, pedido, mesa/balcão, horário, quantidades, adicionais e observações. O botão abre o diálogo de impressão do navegador. **Não existe impressão silenciosa nem confirmação automática de que uma impressora física imprimiu.** O funcionário deve selecionar uma impressora instalada no sistema operacional, verificar a saída e confirmar; cancelar/errar pode ser registrado com uma descrição. Reimprimir cria um novo job explicitamente identificado, mantendo o snapshot original e a trilha de auditoria.

`036_print_concurrency.sql` impede que dois dispositivos iniciem silenciosamente a mesma tentativa. Repetir o mesmo request retorna o resultado anterior; outra tentativa exige reimpressão ou registro de falha. Alterações na fila incrementam a versão para atualizar os outros dispositivos. Falhas de impressão não alteram pedidos, pagamentos, estoque ou presença no KDS.

Para impressão automática sem interação será necessário um agente local autenticado ou integração específica de impressora. Essa integração não foi implementada nem simulada. Impressoras físicas e diálogos de iOS/Android ainda exigem homologação nos equipamentos do estabelecimento.

## Evidências de validação

Em 22/10/2026, `scripts/validation/realtime.mjs` foi executado contra o Neon de homologação usando quatro sessões e quatro conexões WebSocket independentes. O script verifica a branch e o host antes de gravar. Fixtures são novos usuários/organizações de teste, permanecem somente nessa branch e não alteram clientes de produção.

Passaram:

1. Snapshot inicial para proprietário, caixa, cozinha e garçom.
2. Evento confirmado refletido nas quatro conexões sem polling.
3. Rollback sem alteração persistida ou publicada.
4. Tentativa de consultar outra empresa retornando zero linhas.
5. Novo pedido notificando proprietário/caixa/cozinha e não o garçom não envolvido.
6. Marcação de leitura persistida somente para o próprio funcionário.
7. Renovação da capability preservando a assinatura.
8. Reconexão recuperando a versão perdida durante desconexão.
9. Revogação de vínculo removendo acesso ao vivo.
10. Sessão que não pertence mais ao assinante removendo suas linhas.

Comando de repetição (arquivos locais ignorados, sem imprimir credenciais):

```sh
npm exec -- node --env-file=.env.multidevice-validation --env-file=.env.realtime-validation scripts/validation/realtime.mjs
```

`node --test tests/printing.test.mjs` passou com PostgreSQL PGlite: modo digital, criação manual, job único por lote, adicionais após insert do item, rodada posterior sem reenviar itens, snapshot anterior preservado, idempotência, disputa entre dispositivos, falha sem cancelar pedido, reimpressão com snapshot preservado e isolamento entre empresas. `npm run typecheck` passou após os componentes e APIs deste módulo.

Esses resultados não substituem o teste HTTP completo, a validação visual em navegadores móveis ou a impressão em hardware real. O teste WebSocket foi executado com o SDK de cliente e WebSocket nativo do Node, não com quatro navegadores físicos.
