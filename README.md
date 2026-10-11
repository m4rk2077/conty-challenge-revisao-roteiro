# Conty — Revisão de roteiro

API do [desafio 03](https://challenge.appconty.com/desafios/revisao-roteiro): a marca pede ajustes com motivo e prazo, o criador reenvia e a aprovação encerra a revisão. Versões anteriores e os eventos permanecem consultáveis.

## Executar

Use **Node 22.13+ da linha 22** (validado em **22.23.3**) e npm. `node:sqlite` é nativo e pode emitir aviso experimental nessa versão.

```sh
npm ci
npm test
npm run typecheck
npm start
```

`npm run dev` inicia com recarga. A API escuta em `http://127.0.0.1:3000`; `PORT` permite mudar a porta. O banco persiste em `data/review.sqlite`, criado automaticamente; `DB_PATH` permite mudar o arquivo. No PowerShell, por exemplo: `$env:PORT = '3001'; npm start`. As variáveis são opcionais.

`npm run demo` sobe um servidor HTTP em porta livre com banco em memória e relógio fixo, verifica o fluxo e grava [requests e responses completos](examples/fluxo.md). Não altera o banco da API normal. A demonstração usa datas históricas controladas; nos requests manuais, escolha um prazo atual ou futuro de São Paulo.

## Contrato e decisões

| Estado | Operações permitidas |
|---|---|
| `in_review` | Pedir alteração ou aprovar a versão atual |
| `changes_requested` | Enviar a próxima versão dentro do prazo |
| `approved` | Consultar; repetir aprovação devolve o resultado existente |

O enunciado exige estado explícito, motivo e prazo obrigatórios, dia civil inclusivo em `America/Sao_Paulo`, rejeição de prazo passado, histórico e aprovação terminal. As escolhas abaixo são desta implementação:

- Node 22, TypeScript estrito, Hono, SQLite nativo e Vitest; a plataforma não impõe essa stack.
- Um pedido aberto por roteiro. Reenvio exige esse pedido, cumpre-o e retorna a `in_review`. A aprovação com pedido aberto retorna conflito.
- **O prazo também limita o reenvio**, interpretando “até quando” como o limite para a próxima versão. O enunciado rejeita expressamente a criação de pedidos com prazo passado; esta extensão ao reenvio é uma decisão documentada, ajustável se a organização esclarecer outra interpretação.
- Repetir a aprovação retorna `200`, com a mesma versão e `approved_at`, sem novo evento. O requisito oficial exige que a aprovação não reabra; o retry idempotente é nossa escolha.
- O conteúdo e o motivo são textos não vazios (espaços sozinhos não valem); o texto original é preservado. Campos extras de entrada são ignorados. IDs de produção são UUIDs.

### Prazo e histórico

`deadline_date` é uma data real em `YYYY-MM-DD`, sem horário. O domínio recebe `Clock.now()` e calcula o dia em São Paulo com `Intl.DateTimeFormat` e o fuso IANA, sem cortar a data UTC nem fixar um offset. Comparar datas civis mantém o último milissegundo válido. Para `2026-03-12`, os testes aceitam `2026-03-13T02:59:59.999Z` e recusam `2026-03-13T03:00:00.000Z`, tanto para pedido quanto para reenvio. Também verificam uma data histórica com horário de verão.

Versões têm número crescente e referência à versão anterior. Nenhuma operação edita ou exclui versões e eventos antigos. Cada pedido guarda a versão criticada e, após reenvio, a referência à versão que o cumpriu. Os eventos têm sequência crescente, inclusive quando compartilham o mesmo instante. Operações de escrita são transacionais (`BEGIN IMMEDIATE`): falha desfaz estado, versão, pedido e histórico juntos. A consulta lê um snapshot consistente. O retry não cria evento.

## API

Corpos de entrada são objetos JSON; envie `Content-Type: application/json`. Campos de saída usam `snake_case`; instantes usam ISO 8601 em UTC.

| Método e rota | Entrada | Resposta |
|---|---|---|
| `POST /scripts` | `{ "content": "Roteiro original" }` | `201`, `{ script, version }`, versão 1 em `in_review` |
| `GET /scripts/:id` | — | `200`, roteiro, `current_version`, `versions`, `revision_requests`, `history` |
| `POST /scripts/:id/revision-requests` | `{ "reason": "Explicar o benefício", "deadline_date": "2026-03-12" }` | `201`, pedido associado à versão atual |
| `POST /scripts/:id/versions` | `{ "content": "Roteiro revisado" }` | `201`, `{ script, version }`, próxima versão em `in_review` |
| `POST /scripts/:id/approval` | Sem corpo | `200`, `{ script_id, status, approved_version_id, approved_at }` |

O arquivo [examples/fluxo.md](examples/fluxo.md) contém os comandos `curl` e o JSON integral obtido para criação, pedido, reenvio, aprovação, consulta, retry e bloqueios após aprovação. É gerado pelas chamadas executadas, sem respostas inventadas. Substitua IDs e prazo ao executar manualmente contra o servidor normal.

Validação de campos ou JSON: `400` (`INVALID_INPUT` ou `INVALID_JSON`). Roteiro ausente: `404` (`SCRIPT_NOT_FOUND`); rota ausente: `404` (`NOT_FOUND`). Estado incompatível: `409` (`INVALID_STATE`). Prazo encerrado: `409` (`DEADLINE_PASSED`). Todos seguem este formato, por exemplo:

```json
{
  "error": {
    "code": "DEADLINE_PASSED",
    "message": "O prazo terminou em America/Sao_Paulo."
  }
}
```

Entradas são validadas antes de procurar o roteiro; uma entrada inválida retorna `400` mesmo se o ID não existir. Erros inesperados retornam `500` (`INTERNAL_ERROR`) e são registrados no console.

## Validação, limites e uso de IA

Os testes usam relógio fixo e SQLite real: fluxo por API, três versões, preservação de histórico, isolamento entre roteiros, entradas inválidas sem gravação, limites do prazo, aprovação terminal e retry, rollback com falha simulada no histórico e persistência após reabertura do arquivo. A demonstração adicional faz chamadas HTTP reais com o adaptador Node.

Não há autenticação nem separação de usuários/marcas: os papéis são representados pelas operações da API. Não há frontend, upload, vídeo, notificações ou deploy hospedado; a entrega é este repositório executável. Após um prazo perdido, o pedido permanece no histórico e o estado continua `changes_requested`; não implementamos cancelamento nem renegociação, pois não foram definidos no enunciado.

Com mais tempo, validaria com a organização a interpretação do prazo e o fluxo para renegociá-lo, adicionaria autenticação por papel e campanha, migrações versionadas e paginação do histórico para volumes maiores. Essas decisões não impedem demonstrar o contrato entregue.

A análise, o planejamento, a implementação, os testes, os exemplos e a revisão inicial foram feitos com apoio de IA (Codex). Os resultados relatados vêm da execução dos comandos deste repositório em Node 22.23.3. Dois agentes de IA fizeram revisões independentes do domínio e da entrega, sem encontrar problemas concretos no escopo; ambos confirmaram os 47 testes e o typecheck. **Marco ainda não realizou revisão humana pessoal do diff ou dos resultados.** Não atribuímos a ele uma revisão que não ocorreu.
