# container-apps

Repositório de catálogo de apps containerizados, preparado para integrar com uma loja de apps compatível com Cockpit e com o fluxo de empacotamento do projeto container-packaging-tools.

## Estrutura

- `catalog.json` — catálogo principal com os apps disponíveis.
- `apps/` — diretórios com manifestos de cada app.
  - `metadata.yaml` — metadados do pacote.
  - `docker-compose.yml` — definição do container.
  - `config.yml` — esquema de configuração.

## Formato esperado

Cada app é descrito por um bloco em `catalog.json` com:

- `id`
- `name`
- `package_name`
- `version`
- `category`
- `homepage`
- `license`
- `manifest`