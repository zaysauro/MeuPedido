# PWA e Web Push

## Estado e limites

A implementação adiciona manifest, ícones PNG em 192/512 px, ícone maskable, instalação em navegadores compatíveis, fallback offline e atualização do service worker mediante ação do funcionário. As operações continuam dependentes de internet: não existe fila de pedidos ou pagamentos offline. O service worker nunca armazena respostas de API, cookies, tokens, páginas autenticadas ou payloads RSC; o cache contém somente a página pública offline e ícones.

Web Push usa assinaturas reais de navegador, armazenadas no Neon e vinculadas ao usuário e estabelecimento derivados da sessão. Ativação exige um clique e consentimento explícito. Uma assinatura ativa pode ser transferida para outra conta no mesmo navegador somente pela nova ativação autenticada; o cadastro anterior desse dispositivo é removido, preservando os registros comerciais. O logout cancela a assinatura no navegador e tenta removê-la no servidor antes de encerrar a sessão. Nenhum cadastro de funcionário ou estabelecimento é apagado por esse processo.

**Configurar VAPID e um executor de recuperação é necessário antes de homologar push.** Aceitação pelo provedor não confirma exibição no celular. Economia de bateria, rede, configurações de foco e políticas do navegador/sistema podem atrasar ou impedir a entrega. Os testes automatizados usam PostgreSQL local e provedor HTTP simulado; não substituem a instalação e o teste de entrega em aparelhos reais.

## Configuração do servidor

Variáveis exclusivas do servidor:

- `VAPID_PUBLIC_KEY`: chave pública base64url, compartilhada com o navegador pela API autenticada.
- `VAPID_PRIVATE_KEY`: chave privada base64url. Nunca usar prefixo `NEXT_PUBLIC_`.
- `VAPID_SUBJECT`: contato real do operador, como `mailto:suporte@dominio-do-operador`.
- `CRON_SECRET`: segredo aleatório com pelo menos 32 caracteres, apenas no servidor e no executor de recuperação.

Gere uma vez um par usando `web-push.generateVAPIDKeys()` em ambiente seguro. Salve as chaves no gerenciador de segredos; não coloque os valores em commits, logs ou documentos. Use pares diferentes em homologação e produção. Se trocar o par, os funcionários precisam reativar notificações.

Aplique migrations até `034_push_delivery_guards.sql` primeiro em uma branch Neon isolada. Apesar do nome histórico do arquivo, essa migration contém somente tabelas/função de push; impressão tem migration própria. A função `restaurant_register_push_subscription` deriva a organização do usuário, serializa registro concorrente do endpoint e limita a 20 dispositivos por conta. As entregas possuem chaves estrangeiras compostas que impedem associar uma assinatura a uma notificação de outro usuário/estabelecimento.

## Entrega e recuperação após falhas

1. A transação operacional cria `restaurant_events` e os destinatários em `restaurant_notifications` junto dos dados comerciais.
2. Após confirmar uma mutação, o servidor chama `dispatchPushNotifications(20)` em `after()`; o envio nunca ocorre dentro da transação de negócio.
3. `restaurant_push_deliveries` mantém chave única evento/dispositivo, tentativas, lease de um minuto e resultado. A seleção usa `FOR UPDATE SKIP LOCKED`, impedindo dois workers de reivindicar a mesma tentativa.
4. Falhas transitórias têm backoff exponencial, no máximo seis tentativas. Respostas HTTP 404/410 removem a assinatura inválida. Permissões, associação, preferência e leitura da notificação são revalidadas antes do envio.
5. O executor periódico chama `GET` ou `POST /api/internal/push-dispatch` com `Authorization: Bearer <CRON_SECRET>`. Ele recupera tanto eventos confirmados antes de uma queda do servidor quanto entregas cujo lease expirou.

O repositório inclui `scripts/push-worker.mjs`, que executa uma passagem usando `PUSH_WORKER_URL` (URL base HTTPS do ambiente) e `CRON_SECRET`. Agende `node scripts/push-worker.mjs` a cada minuto em um executor já disponível. Um intervalo de até cinco minutos é aceitável como recuperação, mas aumenta a latência de uma entrega cuja tentativa imediata falhou. O script encerra com erro quando faltam configurações ou o endpoint falha, para permitir monitoramento pelo executor. Não crie uma assinatura paga sem decisão do operador. Um scheduler que rode uma vez por dia não é suficiente.

O payload não inclui mesa, cliente, valores, produtos ou credenciais: só uma mensagem genérica sobre novos itens/pedido pronto e um link interno para `/notificacoes`. Apenas eventos de novos pedidos/itens e pedido pronto geram push. O restante continua no histórico do sistema. Mensagens mais antigas que 15 minutos e notificações já lidas não são enviadas; o provedor recebe TTL de 120 segundos. O histórico completo continua consultável no aplicativo.

O envio é **ao menos uma vez**, pois não há transação distribuída com os provedores de push. Se o provedor aceitar e o processo cair antes de persistir a confirmação, uma tentativa pode repetir. A chave única evita reenfileirar a entrega confirmada, e `topic`/`tag` estáveis substituem mensagens repetidas nos provedores/navegadores que suportam esse comportamento; `renotify:false` evita novo som ao substituir uma notificação ainda exibida. Não se promete exatamente uma exibição pelo sistema operacional.

## Instalação e operação

1. Acesse o ambiente HTTPS de homologação e entre com o login individual do funcionário.
2. Abra **Aplicativo e notificações no celular**. No Android, use **Instalar MeuPedido** quando disponível ou o menu do navegador. No iPhone/iPad compatível, use Compartilhar → Adicionar à Tela de Início e abra o ícone instalado.
3. Toque **Ativar notificações neste dispositivo** e autorize no navegador. Recusar não desabilita os fluxos do sistema.
4. Com a cozinha conectada pelo celular e o caixa/garçom em outra sessão, registre um pedido real de teste. Verifique a sincronização na tela; depois teste push com o aplicativo em segundo plano e a tela bloqueada.
5. Para desativar, use **Desativar notificações neste dispositivo**. O logout também cancela a inscrição. Preferências de sons no aplicativo são independentes dos sons controlados pelo sistema operacional.
6. Simule perda de internet: o banner informa indisponibilidade e uma navegação offline exibe a página de recuperação. Reconecte e recupere os dados atuais antes de repetir uma ação cujo resultado tenha ficado incerto.
7. Quando houver nova versão, finalize ou salve o trabalho em andamento e toque **Atualizar aplicativo**. Não há recarregamento forçado durante uma venda.

No iOS/iPadOS, Web Push exige versão compatível e a instalação na Tela de Início; suporte começou em 16.4. O pedido de permissão precisa partir de uma interação do usuário. O sistema não solicita autorização automaticamente. Referências: [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [web-push](https://github.com/web-push-libs/web-push).

## Verificações automatizadas

Execute `node --test tests/pwa-push.test.mjs`. Os testes cobrem:

- Bloqueio de destinos arbitrários, protocolos inseguros, credenciais na URL, nomes de host enganosos e chaves malformadas.
- Cache restrito a arquivos públicos; APIs, mutações e RSC não interceptados.
- Recuperação offline, atualização explícita e destino interno seguro de clique em notificação.
- Dimensões dos ícones, tags estáveis e ausência de repetição de som ao substituir uma notificação visível.
- Migrations reais em PGlite, vínculos por estabelecimento/usuário, rejeição de referência cruzada e transferência explícita de dispositivo.
- APIs de assinatura com sessão expirada, CSRF, consentimento ausente, corpo inválido, manipulação de usuário/estabelecimento e tentativa de revogar dispositivo alheio.
- Execução real da função de dispatch com adaptador PostgreSQL e provedor controlado: entrega única confirmada, backoff, recuperação e limpeza em 410.

Pendente de homologação externa: service worker instalado em navegador real, permissões do sistema, entrega por FCM/APNs/Firefox, logout em dispositivo compartilhado e execução periódica confirmada no ambiente de destino.
