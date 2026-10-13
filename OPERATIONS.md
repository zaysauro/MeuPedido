# MeuPedido — operação e publicação

## Ambiente

- Next.js 15 / React 19 / Better Auth / Neon PostgreSQL.
- `DATABASE_URL`: segredo da branch correta. Produção usa o projeto Neon `frosty-forest-75298234`, branch `br-wandering-brook-b4iqzkmf`, banco `neondb`, schema `public`.
- `EXPECTED_DATABASE_HOST`: verifica que a aplicação usa o host aprovado; vale também para autenticação.
- `BETTER_AUTH_SECRET`: segredo aleatório de no mínimo 32 caracteres; preserve para manter sessões.
- `BETTER_AUTH_URL`: `https://meupedido.sistemakumo.com.br` em produção.
- Nunca use credenciais de produção em previews ou testes.

## Migrações

O executor ignora a migração obsoleta 003. Por padrão verifica a base 000–002 e aplica 004 em diante com transação individual, lock e registro SHA-256 em `meupedido_schema_migrations`. Interrompe erros e divergências de checksum. Não edite arquivos já aplicados: crie uma nova migração.

1. Crie uma branch Neon de teste a partir de produção.
2. Configure `MIGRATION_DATABASE_URL` e `MIGRATION_EXPECTED_HOST` em arquivo local ignorado pelo Git.
3. Execute `node --env-file=.env.validation scripts/migrate.mjs`.
4. Execute `npm test`, `npm run typecheck`, `npm run build` e o teste PostgreSQL remoto com `INTEGRATION_DATABASE_URL` apontando exclusivamente para a branch de teste.
5. Crie e confira uma branch de recuperação de produção. Não migre essa branch.
6. Configure `MIGRATION_RECOVERY_POINT` com o ID real e `MIGRATION_TESTS_PASSED=true`; execute o executor com `--production` e o arquivo de ambiente do destino verificado.
7. Confira estrutura, registro de migrações e preservação de dados existentes. Uma nova execução deve ser um no-op.

`--bootstrap` inclui 000–002 e serve para banco vazio de testes. Não use em produção. O teste remoto desfaz seus dados de fixture por rollback. `tests/api-validation.mjs` cria dados identificados como homologação na aplicação local (porta 4320); o servidor deve usar a branch de teste.

## E-mail

O fluxo de recuperação está implementado, mas depende de um remetente real. Configure `RESEND_API_KEY` como segredo e `EMAIL_FROM` com remetente/domínio verificado no Resend. Faça novo deploy e teste entrega real. Para exigir confirmação no cadastro, defina também `REQUIRE_EMAIL_VERIFICATION=true` somente após validar o envio. Sem serviço configurado, a interface informa que a recuperação automática está indisponível; não finge enviar mensagens.

## Assinaturas e Asaas

Não há cobranças ativas nem credenciais fictícias. `BILLING_ENFORCED=false` permite avaliação sem pagamento. Nenhuma assinatura é apresentada como ativa sem confirmação do provedor. A tabela de assinaturas contempla `trial`, `active`, `past_due`, `canceled`; eventos de webhook têm identificador único por provedor/ambiente. O endpoint Asaas retorna 503 enquanto a integração não estiver habilitada.

Antes da ativação comercial: implementar/verificar assinatura do webhook, consulta autenticada ao provedor, idempotência dos eventos, separação de sandbox/produção, conciliação e recuperação de falhas. Só então habilitar a cobrança e `BILLING_ENFORCED=true`. Exceções administrativas devem listar IDs explicitamente em `HOMOLOGATION_ORGANIZATION_IDS`, variável exclusiva do servidor.

## Impressão

Comprovantes não fiscais e tickets de cozinha têm seleção de 58/80 mm e impressão pelo navegador. Escolha o tamanho correspondente no driver, desative cabeçalhos/rodapés e confira margens. Não existe promessa de impressão silenciosa USB/rede. Teste em cada impressora física antes de operar; agentes locais não são necessários para impressão manual pelo navegador.

## Recuperação

Uma branch Neon de recuperação permite conferir/exportar o estado anterior. Não execute restore/reset sobre produção sem analisar dados novos e obter aprovação para a alteração destrutiva. Faça rollback de deploy pela Vercel quando a falha for da aplicação. Não remova a branch de recuperação sem aprovação do responsável.
