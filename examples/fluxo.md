# Exemplos executados por HTTP

Gerado por `npm run demo`: servidor Hono em porta livre, SQLite em memória, IDs determinísticos e relógio controlado. A API normal usa UUIDs aleatórios e relógio do sistema.

Os comandos abaixo usam a porta padrão 3000 para facilitar a reprodução. O prazo fixo dos exemplos é histórico; no servidor normal, use uma data atual ou futura de São Paulo.

## 1. POST /scripts

Relógio: `2026-03-12T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts' -H 'Content-Type: application/json' -d '{"content":"Apresentar o produto e convidar para conhecer a marca."}'
```

Resposta HTTP 201:

```json
{
  "script": {
    "id": "00000000-0000-4000-8000-000000000001",
    "status": "in_review",
    "current_version_id": "00000000-0000-4000-8000-000000000002",
    "created_at": "2026-03-12T15:00:00.000Z",
    "approved_at": null
  },
  "version": {
    "id": "00000000-0000-4000-8000-000000000002",
    "script_id": "00000000-0000-4000-8000-000000000001",
    "number": 1,
    "content": "Apresentar o produto e convidar para conhecer a marca.",
    "previous_version_id": null,
    "created_at": "2026-03-12T15:00:00.000Z"
  }
}
```

## 2. POST /scripts/00000000-0000-4000-8000-000000000001/revision-requests

Relógio: `2026-03-12T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/revision-requests' -H 'Content-Type: application/json' -d '{"reason":"Mostrar o benefício antes do convite.","deadline_date":"2026-03-12"}'
```

Resposta HTTP 201:

```json
{
  "id": "00000000-0000-4000-8000-000000000004",
  "script_id": "00000000-0000-4000-8000-000000000001",
  "version_id": "00000000-0000-4000-8000-000000000002",
  "reason": "Mostrar o benefício antes do convite.",
  "deadline_date": "2026-03-12",
  "requested_at": "2026-03-12T15:00:00.000Z",
  "fulfilled_by_version_id": null
}
```

## 3. POST /scripts/00000000-0000-4000-8000-000000000001/versions

Relógio: `2026-03-13T02:59:59.999Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/versions' -H 'Content-Type: application/json' -d '{"content":"Mostrar o benefício, apresentar o produto e convidar para conhecer a marca."}'
```

Resposta HTTP 201:

```json
{
  "script": {
    "id": "00000000-0000-4000-8000-000000000001",
    "status": "in_review",
    "current_version_id": "00000000-0000-4000-8000-000000000006",
    "created_at": "2026-03-12T15:00:00.000Z",
    "approved_at": null
  },
  "version": {
    "id": "00000000-0000-4000-8000-000000000006",
    "script_id": "00000000-0000-4000-8000-000000000001",
    "number": 2,
    "content": "Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.",
    "previous_version_id": "00000000-0000-4000-8000-000000000002",
    "created_at": "2026-03-13T02:59:59.999Z"
  }
}
```

## 4. POST /scripts/00000000-0000-4000-8000-000000000001/approval

Relógio: `2026-03-13T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/approval'
```

Resposta HTTP 200:

```json
{
  "script_id": "00000000-0000-4000-8000-000000000001",
  "status": "approved",
  "approved_version_id": "00000000-0000-4000-8000-000000000006",
  "approved_at": "2026-03-13T15:00:00.000Z"
}
```

## 5. GET /scripts/00000000-0000-4000-8000-000000000001

Relógio: `2026-03-13T15:00:00.000Z`.

```sh
curl -X GET 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001'
```

Resposta HTTP 200:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "approved",
  "current_version_id": "00000000-0000-4000-8000-000000000006",
  "created_at": "2026-03-12T15:00:00.000Z",
  "approved_at": "2026-03-13T15:00:00.000Z",
  "current_version": {
    "id": "00000000-0000-4000-8000-000000000006",
    "script_id": "00000000-0000-4000-8000-000000000001",
    "number": 2,
    "content": "Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.",
    "previous_version_id": "00000000-0000-4000-8000-000000000002",
    "created_at": "2026-03-13T02:59:59.999Z"
  },
  "versions": [
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "number": 1,
      "content": "Apresentar o produto e convidar para conhecer a marca.",
      "previous_version_id": null,
      "created_at": "2026-03-12T15:00:00.000Z"
    },
    {
      "id": "00000000-0000-4000-8000-000000000006",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "number": 2,
      "content": "Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.",
      "previous_version_id": "00000000-0000-4000-8000-000000000002",
      "created_at": "2026-03-13T02:59:59.999Z"
    }
  ],
  "revision_requests": [
    {
      "id": "00000000-0000-4000-8000-000000000004",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "version_id": "00000000-0000-4000-8000-000000000002",
      "reason": "Mostrar o benefício antes do convite.",
      "deadline_date": "2026-03-12",
      "requested_at": "2026-03-12T15:00:00.000Z",
      "fulfilled_by_version_id": "00000000-0000-4000-8000-000000000006"
    }
  ],
  "history": [
    {
      "sequence": 1,
      "id": "00000000-0000-4000-8000-000000000003",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "script_created",
      "occurred_at": "2026-03-12T15:00:00.000Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000002"
      }
    },
    {
      "sequence": 2,
      "id": "00000000-0000-4000-8000-000000000005",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "changes_requested",
      "occurred_at": "2026-03-12T15:00:00.000Z",
      "data": {
        "request_id": "00000000-0000-4000-8000-000000000004",
        "version_id": "00000000-0000-4000-8000-000000000002"
      }
    },
    {
      "sequence": 3,
      "id": "00000000-0000-4000-8000-000000000007",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "version_submitted",
      "occurred_at": "2026-03-13T02:59:59.999Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000006",
        "previous_version_id": "00000000-0000-4000-8000-000000000002",
        "request_id": "00000000-0000-4000-8000-000000000004"
      }
    },
    {
      "sequence": 4,
      "id": "00000000-0000-4000-8000-000000000008",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "approved",
      "occurred_at": "2026-03-13T15:00:00.000Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000006"
      }
    }
  ]
}
```

## 6. POST /scripts/00000000-0000-4000-8000-000000000001/approval

Relógio: `2026-03-14T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/approval'
```

Resposta HTTP 200:

```json
{
  "script_id": "00000000-0000-4000-8000-000000000001",
  "status": "approved",
  "approved_version_id": "00000000-0000-4000-8000-000000000006",
  "approved_at": "2026-03-13T15:00:00.000Z"
}
```

## 7. POST /scripts/00000000-0000-4000-8000-000000000001/versions

Relógio: `2026-03-14T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/versions' -H 'Content-Type: application/json' -d '{"content":"Tentativa após aprovação."}'
```

Resposta HTTP 409:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "O reenvio exige changes_requested; estado atual: approved."
  }
}
```

## 8. POST /scripts/00000000-0000-4000-8000-000000000001/revision-requests

Relógio: `2026-03-14T15:00:00.000Z`.

```sh
curl -X POST 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001/revision-requests' -H 'Content-Type: application/json' -d '{"reason":"Tentativa após aprovação.","deadline_date":"2026-03-15"}'
```

Resposta HTTP 409:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "A operação exige in_review; estado atual: approved."
  }
}
```

## 9. GET /scripts/00000000-0000-4000-8000-000000000001

Relógio: `2026-03-14T15:00:00.000Z`.

```sh
curl -X GET 'http://127.0.0.1:3000/scripts/00000000-0000-4000-8000-000000000001'
```

Resposta HTTP 200:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "approved",
  "current_version_id": "00000000-0000-4000-8000-000000000006",
  "created_at": "2026-03-12T15:00:00.000Z",
  "approved_at": "2026-03-13T15:00:00.000Z",
  "current_version": {
    "id": "00000000-0000-4000-8000-000000000006",
    "script_id": "00000000-0000-4000-8000-000000000001",
    "number": 2,
    "content": "Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.",
    "previous_version_id": "00000000-0000-4000-8000-000000000002",
    "created_at": "2026-03-13T02:59:59.999Z"
  },
  "versions": [
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "number": 1,
      "content": "Apresentar o produto e convidar para conhecer a marca.",
      "previous_version_id": null,
      "created_at": "2026-03-12T15:00:00.000Z"
    },
    {
      "id": "00000000-0000-4000-8000-000000000006",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "number": 2,
      "content": "Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.",
      "previous_version_id": "00000000-0000-4000-8000-000000000002",
      "created_at": "2026-03-13T02:59:59.999Z"
    }
  ],
  "revision_requests": [
    {
      "id": "00000000-0000-4000-8000-000000000004",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "version_id": "00000000-0000-4000-8000-000000000002",
      "reason": "Mostrar o benefício antes do convite.",
      "deadline_date": "2026-03-12",
      "requested_at": "2026-03-12T15:00:00.000Z",
      "fulfilled_by_version_id": "00000000-0000-4000-8000-000000000006"
    }
  ],
  "history": [
    {
      "sequence": 1,
      "id": "00000000-0000-4000-8000-000000000003",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "script_created",
      "occurred_at": "2026-03-12T15:00:00.000Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000002"
      }
    },
    {
      "sequence": 2,
      "id": "00000000-0000-4000-8000-000000000005",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "changes_requested",
      "occurred_at": "2026-03-12T15:00:00.000Z",
      "data": {
        "request_id": "00000000-0000-4000-8000-000000000004",
        "version_id": "00000000-0000-4000-8000-000000000002"
      }
    },
    {
      "sequence": 3,
      "id": "00000000-0000-4000-8000-000000000007",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "version_submitted",
      "occurred_at": "2026-03-13T02:59:59.999Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000006",
        "previous_version_id": "00000000-0000-4000-8000-000000000002",
        "request_id": "00000000-0000-4000-8000-000000000004"
      }
    },
    {
      "sequence": 4,
      "id": "00000000-0000-4000-8000-000000000008",
      "script_id": "00000000-0000-4000-8000-000000000001",
      "type": "approved",
      "occurred_at": "2026-03-13T15:00:00.000Z",
      "data": {
        "version_id": "00000000-0000-4000-8000-000000000006"
      }
    }
  ]
}
```
